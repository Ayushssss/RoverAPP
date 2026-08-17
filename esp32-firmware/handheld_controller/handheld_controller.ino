/*
  AgriVerse Rover — handheld controller with display

  A tilt controller with a screen and six buttons. Tilt to steer, hold a button
  to drive, and page through the rover's camera, sensors and link state on a
  1.8" TFT.

  It reaches the rover the same way the phone and the browser do — through the
  relay, as a board with the `controller` role — so the drive board cannot tell
  the difference and needs no code for it.

  ── Why hold-to-drive ─────────────────────────────────────────
  tilt_controller.ino arms on tilt angle alone, and says so in its own header:
  a controller left on a slope steeper than the threshold WILL drive the rover.
  There are buttons here, so that compromise is unnecessary. Nothing moves
  unless DRIVE is held. Let go — or drop it — and the rover stops.

  ── Libraries ─────────────────────────────────────────────────
    • WebSockets      by Markus Sattler
    • ArduinoJson     by Benoit Blanchon
    • TFT_eSPI        by Bodmer
  The MPU6050 is read directly over I2C: Adafruit's library refuses any module
  whose WHO_AM_I is not exactly 0x68, which rejects most clones outright.

  ── Display pins are NOT in this file ─────────────────────────
  TFT_eSPI reads them from its own User_Setup.h at compile time, which is why
  `TFT_eSPI tft = TFT_eSPI()` takes no arguments. The correct one for this
  project is kept at esp32-firmware/TFT_eSPI_User_Setup.h — copy it over
  <Arduino>/libraries/TFT_eSPI/User_Setup.h. A library update reverts the
  installed copy without saying so, and the symptom is a white screen.

    SCK -> 18   SDA -> 23   CS -> 5   A0 -> 4   RESET -> 25
    VCC -> 3V3  GND -> GND  LED -> 3V3

  ── Wiring (this sketch's own pins) ───────────────────────────
    MPU6050   VCC -> 3V3     GND -> GND
              SDA -> 22      SCL -> 27      (AD0 open or GND = 0x68)

    Buttons   each between the pin and GND — no resistors, the internal
              pull-ups are enabled in software.

              A 4-pin tactile switch has only two electrical nodes: the legs
              are joined in pairs inside the body, and pressing bridges the
              pairs. Wire two DIAGONALLY OPPOSITE legs — those are always on
              opposite nodes whichever way the switch is turned — and leave the
              other two unconnected.

                 1 o------o 4      1-2 joined, 3-4 joined
                   |      |        so use 1+3, or 2+4
                 2 o------o 3

              A button that reads as permanently held is wired across a pair
              that was already joined; rotate it 90 degrees.

              GPIO 13  FRONT    hold to drive forward
              GPIO 14  BACK     hold to drive backward
              GPIO 32  LEFT     hold to turn left
              GPIO 33  RIGHT    hold to turn right
              GPIO 26  CENTRE   hold = drive by tilt, tap = next page
                                 held at RESET = forget the saved network
              GPIO 21  HEADLIGHT   6-pin self-locking switch

              Every pad button is a dead-man: the rover only moves while one
              is physically held, so letting go is the stop. There is no
              separate stop button because there does not need to be.

  ── Pairing ───────────────────────────────────────────────────
  Set ROVER_MAC to the drive board's MAC — the one registered in the app.
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include "wifi_provision.h"
#include "supabase_client.h"

/*
  ── WiFi ──

  No credentials in this file. On boot the handset rejoins whatever it used
  last; if that network is gone it lands on the WiFi page with a scan already
  running, and you pick one and type the password on screen.

  Hold CENTRE through reset to forget the stored network and go straight to
  that list.

  wifi_provision.h still carries the phone-based captive portal. Nothing calls
  it now — the on-screen keyboard covers the same job without a second device —
  but it is left in place because a field handset with a broken screen would
  need it.
*/

// ── Server ──
const char* WS_HOST = "roverapp.duckdns.org";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

// ── The rover this controller steers ──
const char* ROVER_MAC = "8C:94:DF:72:0D:90";

/* ── Pins ─────────────────────────────────────────────────── */

/*
  I2C moved off the usual 21/22 because 21 is a button here. The MPU6050 does
  not care which pins it gets — Wire.begin takes them explicitly — and 22/27
  are the two left over once the display and the six buttons have taken theirs.
*/
#define PIN_SDA   22
#define PIN_SCL   27

/*
  A five-way pad — four directions around a centre — plus the headlight switch.

          13  FRONT
   32 LEFT   26 CENTRE   33 RIGHT
          14  BACK

   21  HEADLIGHT (the 6-pin self-locking switch, off to one side)

  ── Why not 15, 16, 17 ────────────────────────────────────────
  16 and 17 are wired to the PSRAM chip on ESP32-WROVER modules and are simply
  not brought out to the headers on many boards. 15 is a boot strapping pin —
  usable, but holding it at reset suppresses the boot log, which is a confusing
  thing to debug.

  Also avoided: 2 and 12, both strapping pins. 12 in particular will stop the
  board booting if it is pulled high at reset, which is exactly what an
  INPUT_PULLUP does. 34-39 are input-only and have no internal pull-up, so a
  button there needs an external resistor.

  19 is left free as a spare.
*/
#define BTN_COUNT 6
const int BTN_PINS[BTN_COUNT] = { 13, 14, 32, 33, 26, 21 };

enum ButtonId : uint8_t { B_FRONT = 0, B_BACK, B_LEFT, B_RIGHT, B_CENTRE, B_LIGHT };

/*
  ── Switch type, per button ───────────────────────────────────

  MOMENTARY  springs back when released. Reads LOW only while physically held.
  LATCHING   self-locking: one press latches it down, the next releases it.
             The level is stable between presses, so a press is an *edge* in
             either direction rather than a sustained LOW.

  As wired here: five momentary pad buttons and one self-locking switch for
  the headlight.

  • The pad must be MOMENTARY. Every one of the five drives the rover while
    held, so the spring *is* the dead-man: let go and it stops. A latching
    switch there would keep the rover running after your hand left.

  • LIGHT is the 6-pin self-locking switch, which suits it exactly. The
    headlight is a state rather than an event, so the switch *position* is the
    truth: down is on, up is off. Nothing to get out of sync, and you can see
    the setting without looking at the screen.

  The type is per button, so swapping a switch later means changing one line
  rather than rewriting the handler.
*/
enum SwitchType : uint8_t { MOMENTARY = 0, LATCHING };

const SwitchType BTN_TYPES[BTN_COUNT] = {
  MOMENTARY,  // B_FRONT
  MOMENTARY,  // B_BACK
  MOMENTARY,  // B_LEFT
  MOMENTARY,  // B_RIGHT
  MOMENTARY,  // B_CENTRE
  LATCHING,   // B_LIGHT   6-pin self-locking switch
};

/**
 * A press shorter than this is a tap, longer is a hold.
 *
 * The centre button is both "drive by tilt" (hold) and "next page" (tap).
 * Splitting them by duration is what lets five buttons cover a pad, a
 * dead-man, and page navigation without a modifier key.
 */
const unsigned long TAP_MS = 350;

/* ── MPU6050 ──────────────────────────────────────────────── */

const uint8_t MPU_ADDR_A = 0x68;
const uint8_t MPU_ADDR_B = 0x69;
uint8_t mpuAddr = MPU_ADDR_A;

const uint8_t REG_SMPLRT_DIV   = 0x19;
const uint8_t REG_CONFIG       = 0x1A;
const uint8_t REG_ACCEL_CONFIG = 0x1C;
const uint8_t REG_ACCEL_X      = 0x3B;
const uint8_t REG_PWR_MGMT1    = 0x6B;
const uint8_t REG_WHO_AM_I     = 0x75;

/** Tilt at which an axis reads full deflection. */
const float FULL_TILT_DEG = 30.0f;
/** Below this the controller is treated as level — hands are never still. */
const float TILT_DEADZONE_DEG = 4.0f;
/** 20Hz. Matches what the phone sends; the rover's failsafe wants 1s. */
const unsigned long SEND_INTERVAL_MS = 50;

/* ── Display ──────────────────────────────────────────────── */

TFT_eSPI tft = TFT_eSPI();

/*
  Rotation 1 is landscape with the ribbon on the left. If the screen reads
  upside down for how you hold it, change this to 3.
*/
const uint8_t TFT_ROTATION = 1;
const int16_t SCREEN_W = 160;
const int16_t SCREEN_H = 128;
const int16_t HEADER_H = 14;
const int16_t FOOTER_H = 12;

// Named for the role they play rather than the hue, so the palette can be
// retuned in one place.
const uint16_t C_BG      = TFT_BLACK;
const uint16_t C_INK     = TFT_WHITE;
const uint16_t C_DIM     = 0x8410;  // mid grey
const uint16_t C_ACCENT  = 0xFD20;  // amber
const uint16_t C_PRIMARY = 0x04FF;  // blue
const uint16_t C_OK      = TFT_GREEN;
const uint16_t C_BAD     = TFT_RED;
const uint16_t C_PANEL   = 0x18E3;  // near-black panel fill

/* ── Pages ────────────────────────────────────────────────── */

/*
  LOGIN and ROVERS sit at the end rather than in reading order.

  changePage() cycles 0..PAGE_CYCLE_COUNT, so everything below that bound is in
  the rotation and everything above it can only be reached deliberately. Sign-in
  and rover selection are destinations, not places to land while thumbing
  through pages mid-drive.
*/
enum Page : uint8_t {
  PAGE_DRIVE = 0, PAGE_RADAR, PAGE_CAMERA, PAGE_SENSORS, PAGE_LINK, PAGE_WIFI,
  PAGE_CYCLE_COUNT,
  PAGE_LOGIN = PAGE_CYCLE_COUNT, PAGE_ROVERS, PAGE_GREET,
  PAGE_COUNT
};
const char* PAGE_NAME[PAGE_COUNT] = {
  "DRIVE", "RADAR", "CAMERA", "SENSORS", "LINK", "WIFI", "SIGN IN", "ROVERS", "HELLO"
};

Page page = PAGE_DRIVE;
/** Forces a full repaint. Set on page change; cleared once drawn. */
bool pageDirty = true;

/* ── Telemetry ────────────────────────────────────────────── */

struct Reading { char key[12]; float value; bool used; };
const int MAX_READINGS = 6;
Reading readings[MAX_READINGS];

/* ── Buttons ──────────────────────────────────────────────── */

/*
  Debounced edge detection.

  A bare digitalRead bounces for a few milliseconds on press, which on a page
  selector reads as three page changes from one push. `pressed` is the debounced
  level; `justPressed` is true for exactly one loop per physical press.
*/
struct Button {
  bool pressed;
  bool lastRaw;
  bool justPressed;
  bool justReleased;
  /**
   * One press of the physical switch, whatever type it is.
   *
   * For a momentary switch that is the push. For a latching one it is either
   * edge — latching down and releasing are both "the user pressed it once".
   */
  bool activated;
  unsigned long changedAt;
  /** When the current press began, for telling a tap from a hold. */
  unsigned long pressedAt;
};

const unsigned long DEBOUNCE_MS = 25;
Button buttons[BTN_COUNT];

/* ── State ────────────────────────────────────────────────── */

WebSocketsClient ws;

bool linked = false;
bool mpuReady = false;
/** No usable network yet: the WiFi page is the only page until there is one. */
bool needsWifi = false;
bool driving = false;

/** Which control is steering right now. */
enum DriveMode : uint8_t { DRIVE_NONE = 0, DRIVE_PAD, DRIVE_TILT };
DriveMode driveMode = DRIVE_NONE;

/** The pad's vector while a direction is held. */
float padX = 0, padY = 0;

/* ── network scan ─────────────────────────────────────────── */

/**
 * Nearby networks, scanned asynchronously.
 *
 * `WiFi.scanNetworks()` blocks for two or three seconds. Doing that inline
 * would freeze the screen and stall the relay long enough for the rover's
 * failsafe to trip, so the scan is started and then polled — the UI keeps
 * running throughout and simply says "scanning".
 */
const int MAX_SEEN = 6;
struct Seen { String ssid; int rssi; bool open; };
Seen seen[MAX_SEEN];
int seenCount = 0;
bool scanning = false;
unsigned long lastScanAt = 0;

/** Highlighted row on the WiFi page, and the result of the last join attempt. */
int wifiSel = 0;
const char* wifiNote = "";
unsigned long wifiNoteAt = 0;

/* ── account and rovers ───────────────────────────────────── */

/*
  The rover this handset steers is now chosen from the account, not compiled in.

  ROVER_MAC above is the fallback for a handset that has never signed in — it
  keeps the old behaviour working rather than bricking the pad behind a login
  screen for someone who only wants to drive.
*/
supa::Rover myRovers[supa::MAX_ROVERS];
int roverCount = 0;
int roverSel = 0;
String activeRoverMac = ROVER_MAC;
String activeRoverName = "default";

/** Sign-in progress, so the screen can say which step is slow. */
enum AuthState : uint8_t { AUTH_OUT = 0, AUTH_WORKING, AUTH_IN, AUTH_FAILED };
AuthState authState = AUTH_OUT;
String authEmail;
String authNote;

/* ── greeting ─────────────────────────────────────────────── */

/*
  Shown after sign-in, then it gets out of the way.

  A greeting that needs dismissing is a greeting that annoys you by the third
  time. This one is on a timer, and any button skips it.
*/
const unsigned long GREET_MS = 2600;
unsigned long greetAt = 0;
int greetIdx = 0;

/* ── radar ────────────────────────────────────────────────── */

/** Matches STOP_CM in night_rover.ino. */
const float RADAR_STOP_CM = 25.0f;
/** Outer ring. Past this the HC-SR04 rarely returns anything usable. */
const float RADAR_RANGE_CM = 200.0f;

/** Recent contacts, newest last, for the fading trail. */
const int RADAR_TRAIL = 10;
struct Blip { float range; float bearing; unsigned long at; };
Blip radarTrail[RADAR_TRAIL];
int radarTrailCount = 0;
float lastPlottedRange = -1;

/* ── on-screen keyboard ───────────────────────────────────── */

/*
  A 10x4 grid driven by the pad, for typing a WPA2 password without a phone.

  Three layouts share one grid rather than scrolling a single long list: at ten
  columns a full character set would be four screens of hunting, and switching
  layout with one button is faster than travelling to a distant cell.

  The last four cells of the bottom row are fixed controls, in every layout, so
  SHIFT/DELETE/SYMBOLS/DONE never move under your thumb.
*/
#define KB_COLS 10
#define KB_ROWS 4

// Trailing spaces in the last row are the four control cells; the characters
// there are never read.
const char KB_LOWER[KB_ROWS][KB_COLS + 1] = {
  "abcdefghij",
  "klmnopqrst",
  "uvwxyz0123",
  "456789    ",
};
const char KB_UPPER[KB_ROWS][KB_COLS + 1] = {
  "ABCDEFGHIJ",
  "KLMNOPQRST",
  "UVWXYZ0123",
  "456789    ",
};
// Row 3 carries only the two symbols the other rows lack; cols 2-5 are blank
// (a blank cell is ignored on press) and 6-9 are the control cells.
const char KB_SYM[KB_ROWS][KB_COLS + 1] = {
  "!@#$%^&*()",
  "-_=+[]{};:",
  "'\",.<>/?\\|",
  "~`        ",
};

enum KbLayout : uint8_t { KB_L_LOWER = 0, KB_L_UPPER, KB_L_SYM };
/** Column of the first control cell on the bottom row. */
const int KB_CTRL_COL = 6;
enum KbCtrl : uint8_t { KB_SHIFT = 0, KB_DEL, KB_MODE, KB_DONE };

bool kbActive = false;
int kbRow = 0, kbCol = 0;
KbLayout kbLayout = KB_L_LOWER;
char kbBuf[65] = {0};
int kbLen = 0;
/** The network being typed for, captured when the keyboard opened. */
String kbSsid;

/*
  What the keyboard is collecting, so one grid serves three jobs.

  The alternative was a callback pointer, which on a sketch this size buys
  indirection and costs the ability to read what DONE does without chasing a
  function pointer.
*/
enum KbTarget : uint8_t { KB_T_WIFI = 0, KB_T_EMAIL, KB_T_PASSWORD };
KbTarget kbTarget = KB_T_WIFI;
/** Title above the field, and whether to print dots instead of characters. */
const char* kbTitle = "";
bool kbMask = false;

/** Re-scanned this often while the WiFi page is open, and not at all otherwise. */
const unsigned long RESCAN_MS = 15000;

float restPitch = 0, restRoll = 0;
float smoothX = 0, smoothY = 0;

unsigned long lastSend = 0;
unsigned long lastBeat = 0;
unsigned long lastPaint = 0;

// Mirrored rover state, as far as this controller can know it.
bool lightOn = false;
bool streaming = false;

/* ── Button handling ──────────────────────────────────────── */

void setupButtons() {
  for (int i = 0; i < BTN_COUNT; i++) {
    pinMode(BTN_PINS[i], INPUT_PULLUP);
    buttons[i].pressed = false;
    buttons[i].lastRaw = false;
    buttons[i].justPressed = false;
    buttons[i].justReleased = false;
    buttons[i].activated = false;
    buttons[i].changedAt = 0;
  }

  /*
    Read the resting position once before the loop starts.

    A self-locking switch may already be latched at power-up, and without this
    the first press would register as a change from an imagined "up" state —
    so a handset switched on with the headlight lever down would report the
    light as off.
  */
  delay(10);
  for (int i = 0; i < BTN_COUNT; i++) {
    const bool raw = digitalRead(BTN_PINS[i]) == LOW;
    buttons[i].pressed = raw;
    buttons[i].lastRaw = raw;
  }
  if (BTN_TYPES[B_LIGHT] == LATCHING) lightOn = buttons[B_LIGHT].pressed;
}

void readButtons() {
  const unsigned long now = millis();
  for (int i = 0; i < BTN_COUNT; i++) {
    Button& b = buttons[i];
    // Wired to ground, so a pressed button reads LOW.
    const bool raw = digitalRead(BTN_PINS[i]) == LOW;
    b.justPressed = false;
    b.justReleased = false;
    b.activated = false;

    if (raw != b.lastRaw) {
      b.lastRaw = raw;
      b.changedAt = now;
      continue;
    }
    if (now - b.changedAt < DEBOUNCE_MS) continue;

    if (raw != b.pressed) {
      b.pressed = raw;
      if (raw) { b.justPressed = true; b.pressedAt = now; }
      else b.justReleased = true;

      // A momentary switch is used once per push; a latching one changes state
      // once per push, in whichever direction. Both are one user action.
      b.activated = (BTN_TYPES[i] == LATCHING) ? true : b.justPressed;

      // Printed for every edge. When "nothing happens", the first thing worth
      // knowing is whether the board saw the button at all — and this separates
      // a wiring fault from a link fault without any guessing.
      static const char* NAMES[BTN_COUNT] =
        { "FRONT", "BACK", "LEFT", "RIGHT", "CENTRE", "LIGHT" };
      Serial.printf("[btn] %-6s %s (GPIO %d)\n",
                    NAMES[i], raw ? "down" : "up", BTN_PINS[i]);
    }
  }
}

/* ── MPU6050 ──────────────────────────────────────────────── */

bool mpuWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(mpuAddr);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool mpuReadAccel(int16_t& ax, int16_t& ay, int16_t& az) {
  Wire.beginTransmission(mpuAddr);
  Wire.write(REG_ACCEL_X);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)mpuAddr, 6, (int)true) != 6) return false;

  ax = (Wire.read() << 8) | Wire.read();
  ay = (Wire.read() << 8) | Wire.read();
  az = (Wire.read() << 8) | Wire.read();
  return true;
}

/**
 * Pitch and roll in degrees, from gravity alone.
 *
 * No gyro and no fusion: a handheld controller is moved slowly and held still,
 * so the accelerometer's own vector is a good enough attitude reference. A
 * complementary filter would buy accuracy during fast shakes, which is not
 * when anybody is trying to steer.
 */
bool readTilt(float& pitchDeg, float& rollDeg) {
  if (!mpuReady) return false;
  int16_t rx, ry, rz;
  if (!mpuReadAccel(rx, ry, rz)) return false;

  const float ax = rx / 16384.0f;
  const float ay = ry / 16384.0f;
  const float az = rz / 16384.0f;

  pitchDeg = atan2f(-ax, sqrtf(ay * ay + az * az)) * 180.0f / PI;
  rollDeg  = atan2f(ay, az) * 180.0f / PI;
  return true;
}

/** Tilt angle to a -1..1 axis, with the dead zone rescaled out. */
float axisFromTilt(float deg) {
  const float mag = fabsf(deg);
  if (mag < TILT_DEADZONE_DEG) return 0;
  const float usable = (mag - TILT_DEADZONE_DEG) / (FULL_TILT_DEG - TILT_DEADZONE_DEG);
  const float clamped = usable > 1.0f ? 1.0f : usable;
  return deg > 0 ? clamped : -clamped;
}

bool setupMpu() {
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);

  bool found = false;
  for (uint8_t addr : { MPU_ADDR_A, MPU_ADDR_B }) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      mpuAddr = addr;
      found = true;
      Serial.printf("[mpu] device at 0x%02X\n", addr);
      break;
    }
  }
  if (!found) {
    Serial.printf("[mpu] nothing at 0x68 or 0x69 — check SDA->%d SCL->%d\n", PIN_SDA, PIN_SCL);
    return false;
  }

  // Clones report all sorts of things in WHO_AM_I; logged, never enforced.
  Wire.beginTransmission(mpuAddr);
  Wire.write(REG_WHO_AM_I);
  uint8_t who = 0xFF;
  if (Wire.endTransmission(false) == 0 && Wire.requestFrom((int)mpuAddr, 1, (int)true) == 1) {
    who = Wire.read();
  }
  Serial.printf("[mpu] WHO_AM_I = 0x%02X\n", who);

  if (!mpuWrite(REG_PWR_MGMT1, 0x00)) return false;  // wake
  delay(100);
  mpuWrite(REG_SMPLRT_DIV, 0x07);
  mpuWrite(REG_CONFIG, 0x03);        // ~44Hz low-pass, damps hand tremor
  mpuWrite(REG_ACCEL_CONFIG, 0x00);  // ±2g, the most sensitive range
  return true;
}

/** Capture the resting attitude so "level" means however you hold it. */
void calibrate() {
  float p = 0, r = 0, sp = 0, sr = 0;
  int taken = 0;
  for (int i = 0; i < 40; i++) {
    if (readTilt(p, r)) { sp += p; sr += r; taken++; }
    delay(15);
  }
  if (taken > 0) {
    restPitch = sp / taken;
    restRoll  = sr / taken;
  }
  Serial.printf("[mpu] rest pitch %.1f roll %.1f\n", restPitch, restRoll);
}

/* ── Relay ────────────────────────────────────────────────── */

void sendRegistration() {
  JsonDocument doc;
  doc["type"] = "register";
  doc["macAddress"] = WiFi.macAddress();
  doc["role"] = "controller";
  // The rover chosen from the account, or the compiled-in fallback if this
  // handset has never signed in.
  doc["roverMac"] = activeRoverMac;
  doc["ip"] = WiFi.localIP().toString();

  String out;
  serializeJson(doc, out);
  ws.sendTXT(out);
}

void sendInput(float x, float y) {
  if (!linked) {
    // Throttled: this is called 20 times a second while driving, and an
    // unthrottled warning would bury everything else in the monitor.
    static unsigned long lastWarn = 0;
    if (millis() - lastWarn > 1000) {
      lastWarn = millis();
      Serial.printf("[ws] NOT CONNECTED - dropped x=%.2f y=%.2f\n", x, y);
    }
    return;
  }
  JsonDocument doc;
  doc["type"] = "input";
  doc["x"] = x;
  doc["y"] = y;

  String out;
  serializeJson(doc, out);
  ws.sendTXT(out);
}

void sendCommand(const char* command, int value) {
  if (!linked) return;
  JsonDocument doc;
  doc["type"] = "command";
  doc["command"] = command;
  doc["value"] = value;

  String out;
  serializeJson(doc, out);
  ws.sendTXT(out);
}

/**
 * Stop, hard.
 *
 * Both a zero vector and an explicit stop, because either one alone can be
 * lost — and the two together cost one extra small message.
 *
 * Called on every release, which is what makes the pad a dead-man: there is no
 * separate stop button because letting go *is* the stop.
 */
void stopRover() {
  driving = false;
  driveMode = DRIVE_NONE;
  smoothX = smoothY = 0;
  sendInput(0, 0);
  sendCommand("stop", 1);
}

void storeReading(const char* key, float value) {
  for (int i = 0; i < MAX_READINGS; i++) {
    if (readings[i].used && strncmp(readings[i].key, key, sizeof(readings[i].key) - 1) == 0) {
      readings[i].value = value;
      return;
    }
  }
  for (int i = 0; i < MAX_READINGS; i++) {
    if (!readings[i].used) {
      strncpy(readings[i].key, key, sizeof(readings[i].key) - 1);
      readings[i].key[sizeof(readings[i].key) - 1] = '\0';
      readings[i].value = value;
      readings[i].used = true;
      return;
    }
  }
  // Full. Dropping the newest keeps the display stable rather than shuffling.
}

void handleMessage(uint8_t* payload, size_t length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;

  const char* type = doc["type"];
  if (!type) return;

  if (strcmp(type, "registered") == 0) {
    Serial.println("[ws] server confirmed registration");
  }
  else if (strcmp(type, "command") == 0) {
    // Mirrored so the screen agrees with whatever else is driving — the app,
    // the browser, or this controller.
    const char* cmd = doc["command"];
    if (cmd && strcmp(cmd, "light") == 0) {
      lightOn = doc["value"] | 0;
      pageDirty = true;
    }
  }
  else if (strcmp(type, "stream") == 0) {
    streaming = doc["on"] | false;
    pageDirty = true;
  }
  else if (strcmp(type, "telemetry") == 0) {
    JsonObject obj = doc["readings"].as<JsonObject>();
    for (JsonPair kv : obj) {
      if (kv.value().is<float>()) storeReading(kv.key().c_str(), kv.value().as<float>());
    }
  }
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      linked = true;
      Serial.println("[ws] connected");
      sendRegistration();
      // Push the headlight lever's actual position, so a rover that booted
      // while this handset was already switched on agrees with the switch
      // rather than waiting for someone to flick it twice.
      if (BTN_TYPES[B_LIGHT] == LATCHING) sendCommand("light", lightOn ? 1 : 0);
      pageDirty = true;
      break;
    case WStype_DISCONNECTED:
      linked = false;
      driving = false;
      Serial.println("[ws] disconnected");
      pageDirty = true;
      break;
    case WStype_TEXT:
      handleMessage(payload, length);
      break;
    default:
      break;
  }
}

/* ── Drawing ──────────────────────────────────────────────── */

void drawHeader() {
  tft.fillRect(0, 0, SCREEN_W, HEADER_H, C_PANEL);
  tft.setTextSize(1);
  tft.setTextColor(C_INK, C_PANEL);
  tft.drawString(PAGE_NAME[page], 4, 4);

  // Colour plus a word, never colour alone.
  const uint16_t colour = linked ? C_OK : C_BAD;
  tft.setTextColor(colour, C_PANEL);
  tft.drawString(linked ? "LINK" : "DOWN", SCREEN_W - 32, 4);
  tft.fillCircle(SCREEN_W - 40, 7, 3, colour);
}

void drawFooter(const char* hint) {
  const int16_t y = SCREEN_H - FOOTER_H;
  tft.fillRect(0, y, SCREEN_W, FOOTER_H, C_PANEL);
  tft.setTextSize(1);
  tft.setTextColor(C_DIM, C_PANEL);
  tft.drawString(hint, 4, y + 3);
}

/** A labelled horizontal bar, centre-origin so reverse reads as reverse. */
void drawBipolarBar(int16_t x, int16_t y, int16_t w, int16_t h, float value, uint16_t colour) {
  tft.drawRect(x, y, w, h, C_DIM);
  tft.fillRect(x + 1, y + 1, w - 2, h - 2, C_BG);

  const int16_t mid = x + w / 2;
  tft.drawFastVLine(mid, y + 1, h - 2, C_DIM);

  const int16_t span = (w / 2) - 2;
  int16_t len = (int16_t)(fabsf(value) * span);
  if (len < 1 && fabsf(value) > 0.01f) len = 1;

  if (len > 0) {
    if (value > 0) tft.fillRect(mid + 1, y + 2, len, h - 4, colour);
    else tft.fillRect(mid - len, y + 2, len, h - 4, colour);
  }
}

void paintDrive(bool full) {
  if (full) {
    tft.fillRect(0, HEADER_H, SCREEN_W, SCREEN_H - HEADER_H - FOOTER_H, C_BG);
    tft.setTextSize(1);
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString("X", 6, 22);
    tft.drawString("Y", 6, 44);
    drawFooter("PAD drives  CENTRE=tilt");
  }

  drawBipolarBar(20, 18, 118, 12, smoothX, C_PRIMARY);
  drawBipolarBar(20, 40, 118, 12, smoothY, C_PRIMARY);

  // Opaque text, so a shorter value cannot leave the tail of a longer one
  // behind. Padding covers the case where it shrinks by more than a character.
  tft.setTextSize(1);
  tft.setTextColor(C_INK, C_BG);
  tft.setTextPadding(90);
  char buf[24];
  snprintf(buf, sizeof(buf), "%+.2f  %+.2f", smoothX, smoothY);
  tft.drawString(buf, 6, 60);
  tft.setTextPadding(0);

  tft.setTextSize(2);
  tft.setTextPadding(120);
  if (!mpuReady) {
    tft.setTextColor(C_BAD, C_BG);
    tft.drawString("NO MPU", 6, 80);
  } else if (driving && !linked) {
    // The pad is working and the rover is not hearing it. Saying "PAD" here
    // would be a lie of omission — the input is going nowhere.
    tft.setTextColor(C_BAD, C_BG);
    tft.drawString("NO LINK", 6, 80);
  } else if (driving) {
    // Names the source, so a pad press and a tilt are told apart at a glance.
    tft.setTextColor(C_OK, C_BG);
    tft.drawString(driveMode == DRIVE_PAD ? "PAD" : "TILT", 6, 80);
  } else {
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString("READY", 6, 80);
  }
  tft.setTextPadding(0);
  tft.setTextSize(1);
}

void paintCamera(bool full) {
  if (full) {
    tft.fillRect(0, HEADER_H, SCREEN_W, SCREEN_H - HEADER_H - FOOTER_H, C_BG);
    drawFooter("tap CENTRE for next page");
  }

  tft.setTextSize(1);
  tft.setTextColor(C_DIM, C_BG);
  tft.drawString("Camera board", 6, 22);

  tft.setTextSize(2);
  tft.setTextPadding(140);
  tft.setTextColor(streaming ? C_OK : C_DIM, C_BG);
  tft.drawString(streaming ? "STREAMING" : "IDLE", 6, 36);
  tft.setTextPadding(0);

  tft.setTextSize(1);
  tft.setTextColor(C_DIM, C_BG);
  // Said plainly rather than left as an empty rectangle that looks broken.
  tft.drawString("Live view is on the app.", 6, 60);
  tft.drawString("This toggles the stream.", 6, 70);

  tft.setTextPadding(120);
  tft.setTextColor(lightOn ? C_ACCENT : C_DIM, C_BG);
  tft.drawString(lightOn ? "Headlight: ON" : "Headlight: OFF", 6, 86);
  tft.setTextPadding(0);
}

void paintSensors(bool full) {
  if (full) {
    tft.fillRect(0, HEADER_H, SCREEN_W, SCREEN_H - HEADER_H - FOOTER_H, C_BG);
    drawFooter("tap CENTRE for next page");
  }

  tft.setTextSize(1);
  int shown = 0;
  char buf[16];

  for (int i = 0; i < MAX_READINGS; i++) {
    if (!readings[i].used) continue;
    const int16_t y = 20 + shown * 14;
    tft.setTextColor(C_DIM, C_BG);
    tft.setTextPadding(80);
    tft.drawString(readings[i].key, 6, y);
    tft.setTextColor(C_INK, C_BG);
    tft.setTextPadding(60);
    snprintf(buf, sizeof(buf), "%.1f", readings[i].value);
    tft.drawString(buf, 92, y);
    shown++;
  }
  tft.setTextPadding(0);

  if (shown == 0) {
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString("No readings yet.", 6, 40);
    tft.drawString("Needs a sensor hub on", 6, 54);
    tft.drawString("this rover.", 6, 64);
  }
}

void paintLink(bool full) {
  if (full) {
    tft.fillRect(0, HEADER_H, SCREEN_W, SCREEN_H - HEADER_H - FOOTER_H, C_BG);
    drawFooter("tap CENTRE for next page");
  }

  tft.setTextSize(1);
  const String values[6] = {
    WiFi.isConnected() ? WiFi.SSID() : String("down"),
    String(WiFi.RSSI()) + " dBm",
    WiFi.localIP().toString(),
    linked ? String("connected") : String("offline"),
    activeRoverMac.substring(9),
    String(millis() / 1000) + "s",
  };
  const char* labels[6] = { "WiFi", "RSSI", "IP", "Relay", "Rover", "Up" };

  for (uint8_t i = 0; i < 6; i++) {
    const int16_t y = 20 + i * 13;
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString(labels[i], 6, y);
    tft.setTextColor(C_INK, C_BG);
    tft.setTextPadding(105);
    tft.drawString(values[i], 52, y);
  }
  tft.setTextPadding(0);
}

/** Kick off a scan if one is not already running. Returns immediately. */
void startScan() {
  if (scanning) return;

  /*
    Stop any connection attempt first.

    A failed join does not end when it times out — the station keeps retrying
    in the background, and a scan started while the radio is mid-attempt
    returns WIFI_SCAN_FAILED rather than a list. The symptom is "no networks
    found" on a handset surrounded by networks, which points at the antenna
    when the real cause is a busy radio.

    Only when disconnected: scanning while associated is fine, and dropping a
    working link to list networks would be its own bug.
  */
  WiFi.mode(WIFI_STA);
  if (!WiFi.isConnected()) {
    WiFi.disconnect(false, false);   // stop retrying; keep the radio and creds
    delay(100);                      // the driver needs a moment to settle
  }

  // `true` is the async flag — this returns at once and the result is
  // collected by pollScan() on a later pass.
  // Stamped before the attempt, so a scan that refuses to start still backs
  // off to the retry interval instead of being hammered every loop.
  lastScanAt = millis();

  const int started = WiFi.scanNetworks(true);
  if (started == WIFI_SCAN_FAILED) {
    Serial.println("[scan] could not start - retrying shortly");
    return;                          // leave `scanning` false for the timer
  }

  scanning = true;
}

/** Collect a finished scan. Returns true when new results arrived. */
bool pollScan() {
  if (!scanning) return false;

  const int found = WiFi.scanComplete();
  if (found == WIFI_SCAN_RUNNING) return false;

  scanning = false;
  seenCount = 0;

  // Distinguished on purpose: a scan that failed and a scan that genuinely
  // found nothing look identical on screen but have nothing else in common.
  if (found < 0) {
    Serial.printf("[scan] FAILED (code %d)\n", found);
  } else {
    Serial.printf("[scan] %d network%s\n", found, found == 1 ? "" : "s");
  }

  if (found > 0) {
    // Results come back sorted strongest-first, so taking the first few is
    // taking the most useful few.
    for (int i = 0; i < found && seenCount < MAX_SEEN; i++) {
      const String ssid = WiFi.SSID(i);
      if (ssid.isEmpty()) continue;   // hidden networks have nothing to show
      seen[seenCount].ssid = ssid;
      seen[seenCount].rssi = WiFi.RSSI(i);
      seen[seenCount].open = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
      seenCount++;
    }
  }

  // Frees the driver's copy. Without this the memory is held until the next
  // scan, which on a board this size is worth reclaiming.
  WiFi.scanDelete();

  // A later scan can return fewer networks than the one that set the cursor.
  if (wifiSel >= seenCount) wifiSel = seenCount ? seenCount - 1 : 0;
  return true;
}

void paintWifi(bool full) {
  if (full) {
    tft.fillRect(0, HEADER_H, SCREEN_W, SCREEN_H - HEADER_H - FOOTER_H, C_BG);
    // On the boot path this page is not a choice, so it says what is expected.
    drawFooter(needsWifi ? "pick a network to continue"
                         : "FRONT/BACK pick  RIGHT join");
  }

  tft.setTextSize(1);

  if (seenCount == 0) {
    tft.setTextColor(C_DIM, C_BG);
    tft.setTextPadding(150);
    tft.drawString(scanning ? "scanning..." : "no networks - retrying", 6, 40);
    tft.setTextPadding(0);
    // "Retrying" rather than "none found": the list refreshes on its own every
    // few seconds, and saying so stops it reading as a dead end.
    tft.drawString("", 6, 54);
    return;
  }

  // The outcome of the last join attempt, for a few seconds. Without it a
  // failed pick looks identical to nothing having happened.
  if (wifiNote[0] && millis() - wifiNoteAt < 4000) {
    drawFooter(wifiNote);
  } else if (wifiNote[0]) {
    wifiNote = "";
    drawFooter("FRONT/BACK pick  RIGHT join");
  }

  const String current = WiFi.isConnected() ? WiFi.SSID() : String();

  for (int i = 0; i < MAX_SEEN; i++) {
    const int16_t y = 20 + i * 14;
    if (i >= seenCount) {
      // Clear the row rather than leaving a stale entry behind when a later
      // scan finds fewer networks.
      tft.fillRect(0, y, SCREEN_W, 14, C_BG);
      continue;
    }

    // The network we are actually on is highlighted — the useful question on
    // this page is usually "is mine here, and how strong".
    const bool mine = current.length() && seen[i].ssid == current;
    const bool sel  = (i == wifiSel);

    // A filled bar marks the selection, so it reads without relying on colour.
    tft.fillRect(0, y - 2, 4, 12, sel ? C_ACCENT : C_BG);

    tft.setTextColor(mine ? C_OK : sel ? C_ACCENT : C_INK, C_BG);
    tft.setTextPadding(90);
    // A padlock for secured, so the two that can be joined from here — open,
    // or already known — are obvious without pressing anything.
    tft.drawString((seen[i].open ? "" : "*") + seen[i].ssid.substring(0, 14), 8, y);

    // Signal as bars plus the number: bars read at a glance, dBm is what you
    // quote when comparing two spots in a field.
    const int rssi = seen[i].rssi;
    const char* bars = rssi > -60 ? "|||" : rssi > -70 ? "||" : rssi > -80 ? "|" : ".";
    tft.setTextColor(rssi > -70 ? C_OK : rssi > -80 ? C_ACCENT : C_BAD, C_BG);
    tft.setTextPadding(22);
    tft.drawString(bars, 106, y);

    tft.setTextColor(C_DIM, C_BG);
    tft.setTextPadding(30);
    tft.drawString(String(rssi), 128, y);
  }
  tft.setTextPadding(0);
}

/* ── keyboard ─────────────────────────────────────────────── */

const char* kbLayoutChars(int row) {
  switch (kbLayout) {
    case KB_L_UPPER: return KB_UPPER[row];
    case KB_L_SYM:   return KB_SYM[row];
    default:         return KB_LOWER[row];
  }
}

/** True for the four fixed control cells at the end of the bottom row. */
bool kbIsCtrl(int row, int col) {
  return row == KB_ROWS - 1 && col >= KB_CTRL_COL;
}

const char* kbCtrlLabel(int col) {
  switch (col - KB_CTRL_COL) {
    case KB_SHIFT: return kbLayout == KB_L_UPPER ? "ab" : "AB";
    case KB_DEL:   return "<X";
    case KB_MODE:  return kbLayout == KB_L_SYM ? "abc" : "#+=";
    default:       return "OK";
  }
}

/** Open the grid for one field. `seed` prefills it, for editing an email. */
void kbOpenFor(KbTarget target, const char* title, bool mask, const String& seed = "") {
  kbActive = true;
  kbTarget = target;
  kbTitle = title;
  kbMask = mask;
  kbLen = 0;
  kbBuf[0] = '\0';
  if (seed.length() && seed.length() < sizeof(kbBuf)) {
    strncpy(kbBuf, seed.c_str(), sizeof(kbBuf) - 1);
    kbLen = strlen(kbBuf);
  }
  kbRow = 0;
  kbCol = 0;
  // Email starts lower-case, since addresses effectively always are, and the
  // first thing you would otherwise do is press shift off.
  kbLayout = KB_L_LOWER;
  pageDirty = true;
}

void kbOpen(const String& ssid) {
  kbSsid = ssid;
  kbOpenFor(KB_T_WIFI, "WiFi password", true);
}

void kbClose() {
  kbActive = false;
  // Wiped rather than left in RAM. It is only a handheld, but a password has
  // no reason to outlive the moment it was needed.
  memset(kbBuf, 0, sizeof(kbBuf));
  kbLen = 0;
  pageDirty = true;
}

void paintKeyboard(bool full) {
  const int16_t cellW = SCREEN_W / KB_COLS;          // 16
  const int16_t gridTop = 44;
  const int16_t cellH = (SCREEN_H - FOOTER_H - gridTop) / KB_ROWS;

  if (full) {
    tft.fillScreen(C_BG);
    tft.fillRect(0, 0, SCREEN_W, HEADER_H, C_PANEL);
    tft.setTextSize(1);
    tft.setTextColor(C_ACCENT, C_PANEL);
    tft.drawString(kbTitle, 4, 4);
    if (kbTarget == KB_T_WIFI) {
      tft.setTextColor(C_DIM, C_PANEL);
      tft.drawString(kbSsid.substring(0, 12), 78, 4);
    }
    drawFooter("pad moves - CENTRE picks");
  }

  /*
    Shown in clear, not masked.

    This is a handset you are holding in a field, so there is nobody to shoulder
    surf — and a masked field makes a typo undetectable when correcting it costs
    a dozen button presses.
  */
  tft.setTextSize(1);
  tft.setTextColor(C_INK, C_BG);
  tft.setTextPadding(SCREEN_W - 12);
  /*
    A password is shown as dots, an email in full.

    An address is typed once and mistyped often, and hiding it means the only
    way to check it is to sign in and see whether it worked. A password is the
    one worth covering, because it is the one somebody could be reading over
    your shoulder in a field.

    The last character stays visible while typing either way — on a pad with no
    tactile feedback, dots alone make a wrong keypress invisible until the whole
    attempt fails.
  */
  String shown;
  if (!kbLen) {
    shown = "(empty)";
  } else if (kbMask) {
    for (int i = 0; i < kbLen - 1; i++) shown += '*';
    shown += kbBuf[kbLen - 1];
  } else {
    // Right-aligned to the tail once it overflows, so you can see what you are
    // typing rather than the beginning of something long.
    shown = kbLen > 20 ? String(kbBuf + kbLen - 20) : String(kbBuf);
  }
  tft.drawString(shown, 6, 20);
  tft.setTextPadding(0);

  tft.setTextColor(C_DIM, C_BG);
  tft.setTextPadding(40);
  tft.drawString(String(kbLen), SCREEN_W - 24, 20);
  tft.setTextPadding(0);

  tft.drawFastHLine(0, 34, SCREEN_W, C_PANEL);

  for (int r = 0; r < KB_ROWS; r++) {
    const char* chars = kbLayoutChars(r);
    for (int c = 0; c < KB_COLS; c++) {
      const int16_t x = c * cellW;
      const int16_t y = gridTop + r * cellH;
      const bool sel = (r == kbRow && c == kbCol);
      const bool ctrl = kbIsCtrl(r, c);

      tft.fillRect(x, y, cellW - 1, cellH - 1, sel ? C_PRIMARY : C_BG);
      tft.setTextColor(sel ? C_INK : ctrl ? C_ACCENT : C_INK,
                       sel ? C_PRIMARY : C_BG);

      if (ctrl) {
        // Two characters at size 1 fit a 16px cell; the label is chosen short.
        tft.drawString(kbCtrlLabel(c), x + 2, y + 3);
      } else {
        const char ch[2] = { chars[c], '\0' };
        tft.drawString(ch, x + 5, y + 3);
      }
    }
  }
}

/** Returns true when the keyboard handled this pass and nothing else should. */
bool handleKeyboard() {
  if (!kbActive) return false;

  if (buttons[B_FRONT].justPressed) { kbRow = (kbRow + KB_ROWS - 1) % KB_ROWS; }
  if (buttons[B_BACK].justPressed)  { kbRow = (kbRow + 1) % KB_ROWS; }
  if (buttons[B_LEFT].justPressed)  { kbCol = (kbCol + KB_COLS - 1) % KB_COLS; }
  if (buttons[B_RIGHT].justPressed) { kbCol = (kbCol + 1) % KB_COLS; }

  if (buttons[B_CENTRE].justReleased) {
    const unsigned long held = millis() - buttons[B_CENTRE].pressedAt;

    // Held is cancel, consistent with tap-versus-hold everywhere else.
    if (held >= TAP_MS) {
      Serial.println("[kb] cancelled");
      kbClose();
      return true;
    }

    if (kbIsCtrl(kbRow, kbCol)) {
      switch (kbCol - KB_CTRL_COL) {
        case KB_SHIFT:
          kbLayout = (kbLayout == KB_L_UPPER) ? KB_L_LOWER : KB_L_UPPER;
          break;
        case KB_DEL:
          if (kbLen > 0) kbBuf[--kbLen] = '\0';
          break;
        case KB_MODE:
          kbLayout = (kbLayout == KB_L_SYM) ? KB_L_LOWER : KB_L_SYM;
          break;
        case KB_DONE: {
          const KbTarget target = kbTarget;
          const String typed = String(kbBuf);
          const String ssid = kbSsid;
          kbClose();

          if (target == KB_T_WIFI) {
            drawFooter("joining...");
            if (wifiprov::join(ssid, typed)) {
              wifiprov::save(ssid, typed);
              wifiNote = "joined and saved";
              ws.disconnect();
              ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
            } else {
              // Left alone on failure: a wrong password must not cost the
              // network that was working.
              wifiNote = "wrong password?";
            }
            wifiNoteAt = millis();
            page = PAGE_WIFI;
          }
          else if (target == KB_T_EMAIL) {
            // Straight on to the password rather than back to a form. Two
            // fields is not a form worth building on a five-button pad.
            authEmail = typed;
            authEmail.trim();
            kbOpenFor(KB_T_PASSWORD, "Password", true);
          }
          else {
            beginSignIn(authEmail, typed);
          }
          pageDirty = true;
          return true;
        }
      }
    } else {
      const char ch = kbLayoutChars(kbRow)[kbCol];
      if (ch != ' ' && kbLen < (int)sizeof(kbBuf) - 1) {
        kbBuf[kbLen++] = ch;
        kbBuf[kbLen] = '\0';
      }
    }
  }

  return true;
}

/* ══════════════ Account, rovers, greeting, radar ══════════════ */

/*
  ── Drawn glyphs, not emoji ───────────────────────────────────

  The screen has no emoji. TFT_eSPI's bundled fonts are 7-bit ASCII, so a real
  emoji is not a character it is missing — there is no glyph table to miss it
  from, and printing one puts a blank box on screen.

  These are drawn from primitives instead: a few circles and lines each, at the
  size the panel can actually resolve. They read as the thing they are meant to
  be at 160x128, which a downscaled colour bitmap would not, and they cost
  bytes rather than kilobytes.
*/

void glyphSmile(int16_t x, int16_t y, uint16_t c) {
  tft.drawCircle(x, y, 8, c);
  tft.fillCircle(x - 3, y - 3, 1, c);
  tft.fillCircle(x + 3, y - 3, 1, c);
  // Mouth: an arc approximated by three chords, which at this size is
  // indistinguishable from a curve and far cheaper than trig.
  tft.drawLine(x - 4, y + 2, x - 2, y + 4, c);
  tft.drawLine(x - 2, y + 4, x + 2, y + 4, c);
  tft.drawLine(x + 2, y + 4, x + 4, y + 2, c);
}

void glyphMoon(int16_t x, int16_t y, uint16_t c) {
  tft.fillCircle(x, y, 8, c);
  // Bite out of it with the background colour — a crescent for the cost of
  // two circles.
  tft.fillCircle(x + 4, y - 3, 7, C_BG);
}

void glyphSprout(int16_t x, int16_t y, uint16_t c) {
  tft.drawLine(x, y + 7, x, y - 2, c);
  tft.fillCircle(x - 4, y - 2, 3, c);
  tft.fillCircle(x + 4, y - 4, 3, c);
}

void glyphBolt(int16_t x, int16_t y, uint16_t c) {
  tft.fillTriangle(x + 2, y - 8, x - 4, y + 1, x + 1, y + 1, c);
  tft.fillTriangle(x - 1, y + 8, x + 4, y - 1, x - 1, y - 1, c);
}

void glyphWave(int16_t x, int16_t y, uint16_t c) {
  // A hand: palm plus four fingers.
  tft.fillRoundRect(x - 4, y - 1, 9, 8, 2, c);
  for (int i = 0; i < 4; i++) tft.drawFastVLine(x - 3 + i * 3, y - 6, 6, c);
}

/** Greetings, paired with the glyph that suits them. */
struct Greeting { const char* line; void (*glyph)(int16_t, int16_t, uint16_t); uint16_t colour; };

const Greeting GREETINGS[] = {
  { "Ready to roll",   glyphSmile,  C_ACCENT  },
  { "Field awaits",    glyphSprout, C_OK      },
  { "Night shift on",  glyphMoon,   C_PRIMARY },
  { "Fully charged",   glyphBolt,   C_ACCENT  },
  { "Welcome back",    glyphWave,   C_OK      },
};
const int GREETING_COUNT = sizeof(GREETINGS) / sizeof(GREETINGS[0]);

void showGreeting() {
  // Seeded from the clock so it is not the same line every power-on. Not
  // random enough for anything that matters, plenty for a hello.
  greetIdx = (int)(millis() / 7) % GREETING_COUNT;
  greetAt = millis();
  page = PAGE_GREET;
  pageDirty = true;
}

void paintGreet(bool full) {
  if (!full) return;
  const Greeting& g = GREETINGS[greetIdx];

  tft.fillScreen(C_BG);
  g.glyph(SCREEN_W / 2, 40, g.colour);

  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(C_INK, C_BG);
  tft.drawString(g.line, SCREEN_W / 2, 60);

  tft.setTextColor(C_DIM, C_BG);
  // The address, tail-first if it is long: the domain identifies the account
  // more usefully than the first twelve characters of the local part.
  String who = supa::userEmail.length() ? supa::userEmail : String("not signed in");
  if (who.length() > 24) who = who.substring(who.length() - 24);
  tft.drawString(who, SCREEN_W / 2, 76);

  if (roverCount > 0) {
    tft.setTextColor(C_ACCENT, C_BG);
    tft.drawString(String(roverCount) + (roverCount == 1 ? " rover" : " rovers") + " linked",
                   SCREEN_W / 2, 92);
  }
  tft.setTextDatum(TL_DATUM);
  drawFooter("any key to continue");
}

/** Adopt one of the fetched rovers as the one this handset drives. */
void selectRover(int index) {
  if (index < 0 || index >= roverCount) return;
  roverSel = index;
  activeRoverMac = myRovers[index].mac;
  activeRoverName = myRovers[index].name;
  Serial.printf("[rover] now driving %s (%s)\n",
                activeRoverName.c_str(), activeRoverMac.c_str());
  // Re-register so the relay routes this rover's traffic to us. Without it the
  // handset keeps talking about the previous MAC and the new rover never moves.
  sendRegistration();
}

/** Ask Supabase for this account's rovers and adopt the first one. */
void loadRovers() {
  roverCount = supa::fetchRovers(myRovers, supa::MAX_ROVERS);
  if (roverCount < 0) {
    roverCount = 0;
    authNote = supa::lastError;
    return;
  }
  if (roverCount > 0) selectRover(0);
}

/**
 * Sign in, on the main loop, with the screen already saying so.
 *
 * The HTTPS round trip takes a second or two and blocks. Painting "signing
 * in..." *before* starting it is the whole point — otherwise the handset looks
 * frozen for the exact duration of the thing the user is waiting for.
 */
void beginSignIn(const String& email, const String& password) {
  authState = AUTH_WORKING;
  authNote = "";
  page = PAGE_LOGIN;
  paint(true);

  if (supa::signIn(email, password)) {
    authState = AUTH_IN;
    loadRovers();
    showGreeting();
  } else {
    authState = AUTH_FAILED;
    authNote = supa::lastError;
    pageDirty = true;
  }
}

void paintLogin(bool full) {
  if (!full) return;

  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);

  if (authState == AUTH_WORKING) {
    tft.setTextColor(C_ACCENT, C_BG);
    tft.drawString("signing in...", SCREEN_W / 2, 52);
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString(authEmail.substring(0, 24), SCREEN_W / 2, 70);
    tft.setTextDatum(TL_DATUM);
    drawFooter("talking to supabase");
    return;
  }

  glyphSmile(SCREEN_W / 2, 34, C_ACCENT);
  tft.setTextColor(C_INK, C_BG);
  tft.drawString("Sign in to AgriVerse", SCREEN_W / 2, 52);

  if (authState == AUTH_FAILED && authNote.length()) {
    tft.setTextColor(C_BAD, C_BG);
    tft.drawString(authNote.substring(0, 26), SCREEN_W / 2, 68);
  } else {
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString("same account as the app", SCREEN_W / 2, 68);
  }

  tft.setTextColor(C_PRIMARY, C_BG);
  tft.drawString("CENTRE to enter email", SCREEN_W / 2, 90);
  tft.setTextDatum(TL_DATUM);
  drawFooter("hold CENTRE to skip");
}

void paintRovers(bool full) {
  if (full) {
    tft.setTextSize(1);
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString("your rovers", 6, 18);
  }

  const int16_t top = 32;
  const int16_t rowH = 16;

  if (roverCount == 0) {
    tft.setTextColor(C_DIM, C_BG);
    tft.setTextPadding(SCREEN_W - 12);
    tft.drawString(authNote.length() ? authNote.substring(0, 24) : String("none on this account"),
                   6, top);
    tft.setTextPadding(0);
    drawFooter("add one in the app");
    return;
  }

  for (int i = 0; i < roverCount && i < 5; i++) {
    const int16_t y = top + i * rowH;
    const bool on = i == roverSel;
    tft.fillRect(2, y - 2, SCREEN_W - 4, rowH - 2, on ? C_PANEL : C_BG);
    if (on) tft.drawRect(2, y - 2, SCREEN_W - 4, rowH - 2, C_ACCENT);

    // A tick against the one actually being driven, which is not always the
    // one highlighted — the pad moves the highlight, CENTRE commits it.
    const bool active = myRovers[i].mac == activeRoverMac;
    tft.setTextColor(active ? C_OK : (on ? C_INK : C_DIM), on ? C_PANEL : C_BG);
    tft.drawString(String(active ? "* " : "  ") + myRovers[i].name.substring(0, 16), 6, y + 2);
  }
  drawFooter("CENTRE selects");
}

/* ── radar ────────────────────────────────────────────────── */

/** Latest value for a telemetry key, or `fallback` if it has not arrived. */
float readingOr(const char* key, float fallback) {
  for (int i = 0; i < MAX_READINGS; i++) {
    if (readings[i].used && strcmp(readings[i].key, key) == 0) return readings[i].value;
  }
  return fallback;
}

/**
 * Keep a short trail of contacts.
 *
 * Only distinct ranges are pushed. Telemetry arrives twice a second whether or
 * not anything changed, and appending every frame would stack identical blips
 * on one spot until the trail was a solid dot.
 */
void radarPush(float range, float bearing) {
  if (range <= 0) return;
  if (lastPlottedRange > 0 && fabsf(range - lastPlottedRange) < 2.0f) return;
  lastPlottedRange = range;

  if (radarTrailCount < RADAR_TRAIL) {
    radarTrail[radarTrailCount++] = { range, bearing, millis() };
  } else {
    for (int i = 1; i < RADAR_TRAIL; i++) radarTrail[i - 1] = radarTrail[i];
    radarTrail[RADAR_TRAIL - 1] = { range, bearing, millis() };
  }
}

void paintRadar(bool full) {
  // The rover sits at the bottom centre looking up the screen, matching the
  // console's scope so the two do not have to be read differently.
  const int16_t cx = SCREEN_W / 2;
  const int16_t cy = SCREEN_H - FOOTER_H - 4;
  const int16_t rMax = 84;

  const float range = readingOr("distanceCm", -1);
  const float bearing = readingOr("bearingDeg", 0);
  const bool irBlocked = readingOr("irBlocked", 0) > 0;
  const bool blocked = readingOr("obstacle", 0) > 0;

  if (full) {
    tft.fillScreen(C_BG);
    drawHeader();

    // Range rings, quartered, with the outermost labelled.
    for (int i = 1; i <= 4; i++) {
      tft.drawCircle(cx, cy, (rMax * i) / 4, i == 4 ? C_DIM : C_PANEL);
    }
    // The band the rover refuses to enter.
    tft.drawCircle(cx, cy, (int16_t)(RADAR_STOP_CM / RADAR_RANGE_CM * rMax), C_BAD);

    tft.setTextSize(1);
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString(String((int)RADAR_RANGE_CM), cx + 3, cy - rMax + 2);
    tft.drawString("cm", cx + 3, cy - rMax + 12);
  }

  // Wipe only the plotting area, so the rings are not redrawn every frame —
  // a full clear at 4Hz reads as a flicker on this panel.
  tft.fillRect(0, HEADER_H + 1, SCREEN_W, 24, C_BG);

  tft.setTextSize(1);
  tft.setTextDatum(TL_DATUM);
  if (range > 0) {
    tft.setTextColor(range < RADAR_STOP_CM ? C_BAD : C_OK, C_BG);
    tft.drawString(String((int)range) + " cm", 6, HEADER_H + 5);
  } else {
    tft.setTextColor(C_DIM, C_BG);
    tft.drawString("no echo", 6, HEADER_H + 5);
  }
  if (irBlocked) {
    tft.setTextColor(C_BAD, C_BG);
    tft.drawString("IR", SCREEN_W - 60, HEADER_H + 5);
  }
  if (blocked) {
    tft.setTextColor(C_BAD, C_BG);
    tft.drawString("STOP", SCREEN_W - 34, HEADER_H + 5);
  }

  radarPush(range, bearing);

  // Redraw the fan area, then the trail and the live contact over it.
  tft.fillRect(cx - rMax - 1, cy - rMax - 1, (rMax + 1) * 2, rMax - 8, C_BG);
  for (int i = 1; i <= 4; i++) tft.drawCircle(cx, cy, (rMax * i) / 4, i == 4 ? C_DIM : C_PANEL);
  tft.drawCircle(cx, cy, (int16_t)(RADAR_STOP_CM / RADAR_RANGE_CM * rMax), C_BAD);

  const unsigned long now = millis();
  for (int i = 0; i < radarTrailCount; i++) {
    if (now - radarTrail[i].at > 4000) continue;
    const float rad = radarTrail[i].bearing * PI / 180.0f;
    const float rr = fminf(radarTrail[i].range / RADAR_RANGE_CM, 1.0f) * rMax;
    const int16_t x = cx + (int16_t)(rr * sinf(rad));
    const int16_t y = cy - (int16_t)(rr * cosf(rad));
    tft.fillCircle(x, y, 1, C_PANEL);
  }

  if (range > 0) {
    const float rad = bearing * PI / 180.0f;
    const float rr = fminf(range / RADAR_RANGE_CM, 1.0f) * rMax;
    const int16_t x = cx + (int16_t)(rr * sinf(rad));
    const int16_t y = cy - (int16_t)(rr * cosf(rad));
    const uint16_t c = range < RADAR_STOP_CM ? C_BAD : C_OK;
    tft.fillCircle(x, y, 3, c);
    tft.drawCircle(x, y, 6, c);
  }

  // The rover itself, drawn last so nothing covers it.
  tft.fillCircle(cx, cy, 3, C_PRIMARY);
  if (irBlocked) tft.drawCircle(cx, cy, 8, C_BAD);

  if (full) drawFooter(activeRoverName.substring(0, 20).c_str());
}

void paint(bool full) {
  if (kbActive) { paintKeyboard(full); return; }

  // The greeting and the radar own the whole panel — they clear and draw their
  // own chrome. Painting the standard background and header underneath them
  // would be drawn once and immediately covered, which on this display is a
  // visible flash on every repaint.
  const bool fullBleed = (page == PAGE_GREET || page == PAGE_RADAR);
  if (!fullBleed) {
    if (full) tft.fillScreen(C_BG);
    drawHeader();
  }

  switch (page) {
    case PAGE_DRIVE:   paintDrive(full);   break;
    case PAGE_RADAR:   paintRadar(full);   break;
    case PAGE_CAMERA:  paintCamera(full);  break;
    case PAGE_SENSORS: paintSensors(full); break;
    case PAGE_LINK:    paintLink(full);    break;
    case PAGE_WIFI:    paintWifi(full);    break;
    case PAGE_LOGIN:   paintLogin(full);   break;
    case PAGE_ROVERS:  paintRovers(full);  break;
    case PAGE_GREET:   paintGreet(full);   break;
    default: break;
  }
}

/* ── Input ────────────────────────────────────────────────── */

void changePage(int delta) {
  // Leaving the WiFi page before joining something would strand the user on a
  // screen with nothing on it that works.
  if (needsWifi) return;

  // Releasing the pad mid-drive would otherwise leave the rover running while
  // you browse another page.
  if (driving) {
    driving = false;
    sendInput(0, 0);
    sendCommand("stop", 1);
  }
  /*
    Only the cycle pages are in the rotation.

    Landing on the sign-in screen by thumbing past CAMERA would be a nuisance
    at best and, mid-drive, a way to lose the pad entirely. They are reachable
    from the LINK page and from boot, where getting there is deliberate.

    From a non-cycle page, any step returns to DRIVE rather than continuing
    from an index that is outside the range — which would otherwise walk
    further into the pages that are not supposed to be in the cycle.
  */
  if (page >= PAGE_CYCLE_COUNT) {
    page = PAGE_DRIVE;
  } else {
    page = (Page)((page + PAGE_CYCLE_COUNT + delta) % PAGE_CYCLE_COUNT);
  }
  pageDirty = true;

  // Scan on arrival, so the list is already filling by the time the page is
  // drawn rather than sitting empty until the first refresh tick.
  if (page == PAGE_WIFI) startScan();
}

/**
 * The home shortcut: straight back to the drive page from anywhere.
 *
 * Bound to a CENTRE hold, which is free everywhere except the drive page —
 * there it already means "steer by tilt", and a page you are already on is not
 * one you need a shortcut to.
 */
const unsigned long HOME_HOLD_MS = 600;

void goHome() {
  if (needsWifi) return;
  if (kbActive) kbClose();
  page = PAGE_DRIVE;
  pageDirty = true;
  Serial.println("[ui] home");
}

void disarm(const char* why) {
  if (!driving) return;
  stopRover();
  pageDirty = true;
  Serial.printf("[drive] stopped — %s\n", why);
}

/**
 * The pad direction currently held, as a stick vector at full deflection.
 *
 * Sent as a vector rather than as the firmware's discrete `forward`/`left`
 * commands on purpose: the rover already treats a vector as a continuous
 * instruction, so holding a direction becomes "keep sending this" with no
 * firmware change and no new message type.
 *
 * Opposite buttons cancel, which is what a physical pad does anyway, and means
 * a stuck button cannot combine with a real one into something unintended.
 */
bool padVector(float& x, float& y) {
  const bool f = buttons[B_FRONT].pressed;
  const bool b = buttons[B_BACK].pressed;
  const bool l = buttons[B_LEFT].pressed;
  const bool r = buttons[B_RIGHT].pressed;

  x = (l ? -1.0f : 0.0f) + (r ? 1.0f : 0.0f);
  y = (f ?  1.0f : 0.0f) + (b ? -1.0f : 0.0f);

  if (x == 0 && y == 0) return false;

  // A diagonal would otherwise ask for 1.41x full power.
  const float mag = sqrtf(x * x + y * y);
  if (mag > 1.0f) { x /= mag; y /= mag; }
  return true;
}

void handleButtons() {
  readButtons();

  // The keyboard owns every button while it is open, so nothing below can fire
  // a page change or a drive command from the same press.
  if (handleKeyboard()) return;

  /*
    The centre button does two jobs, told apart by how long it is held.

    A quick tap moves to the next page. Holding it drives by tilt. Nothing is
    decided until release, because until then a press could still become
    either — which is why the page change happens on the *up* edge.
  */
  /*
    ── the greeting ───────────────────────────────────────────
    Any button dismisses it, and that press does nothing else — otherwise the
    keypress that skips a hello also changes a page or starts the rover.
  */
  if (page == PAGE_GREET) {
    for (int i = 0; i < BTN_COUNT; i++) {
      if (buttons[i].justPressed) { goHome(); return; }
    }
    return;
  }

  if (buttons[B_CENTRE].justReleased) {
    const unsigned long heldFor = millis() - buttons[B_CENTRE].pressedAt;

    // Home, from anywhere that is not the drive page. Checked before the tilt
    // and page-cycle cases so a hold cannot also disarm or advance a page.
    if (page != PAGE_DRIVE && heldFor >= HOME_HOLD_MS) {
      goHome();
      return;
    }

    if (driveMode == DRIVE_TILT) {
      disarm("centre released");
    } else if (page == PAGE_LOGIN) {
      // Tap starts sign-in; the hold above already handled skipping.
      if (heldFor < TAP_MS) kbOpenFor(KB_T_EMAIL, "Email", false, supa::userEmail);
    } else if (page == PAGE_ROVERS) {
      if (heldFor < TAP_MS) selectRover(roverSel);
      pageDirty = true;
    } else if (heldFor < TAP_MS) {
      changePage(1);
    }
  }

  /*
    ── the rover picker owns the pad ──────────────────────────
    Same reasoning as the WiFi page below: a chooser is not a place anyone is
    also steering from, and one button meaning two things is worse than either.
  */
  if (page == PAGE_ROVERS) {
    if (buttons[B_FRONT].justPressed && roverCount) {
      roverSel = (roverSel + roverCount - 1) % roverCount;
    }
    if (buttons[B_BACK].justPressed && roverCount) {
      roverSel = (roverSel + 1) % roverCount;
    }
    if (buttons[B_LEFT].justPressed) goHome();
    return;
  }

  // Nothing on the sign-in screen drives anything.
  if (page == PAGE_LOGIN) return;

  if (buttons[B_LIGHT].activated) {
    /*
      Follows the switch position rather than toggling.

      With a self-locking switch the lever itself carries the state, so reading
      it is always right — whereas a toggle can drift out of step the first
      time a message is dropped, leaving the lever down and the lamp off with
      no way to tell which is lying.

      The value sent is the state being moved to, so the board follows this
      handset instead of keeping a flag of its own.
    */
    lightOn = (BTN_TYPES[B_LIGHT] == LATCHING) ? buttons[B_LIGHT].pressed : !lightOn;
    sendCommand("light", lightOn ? 1 : 0);
    pageDirty = true;
    Serial.printf("[light] %s\n", lightOn ? "ON" : "OFF");
  }

  /*
    ── the WiFi page owns the pad ─────────────────────────────

    On this one page the pad picks a network instead of driving. It is a
    settings screen: nobody browsing WiFi is also steering, and having the
    buttons mean two things at once would be worse than either.

    Handled before the drive block, which then returns early, so there is no
    window where a press does both.
  */
  if (page == PAGE_WIFI) {
    /*
      Deliberately not pageDirty.

      pageDirty triggers a full fillScreen, and doing that on every cursor move
      makes the whole page flash black — which is what the "glitching" was. The
      10Hz repaint calls paintWifi(false), which redraws the rows in place, so
      the move is picked up on the next tick with no wipe.
    */
    if (buttons[B_FRONT].justPressed && seenCount) {
      wifiSel = (wifiSel + seenCount - 1) % seenCount;
    }
    if (buttons[B_BACK].justPressed && seenCount) {
      wifiSel = (wifiSel + 1) % seenCount;
    }
    if (buttons[B_LEFT].justPressed) changePage(-1);

    if (buttons[B_RIGHT].justPressed && seenCount && wifiSel < seenCount) {
      const String ssid = seen[wifiSel].ssid;
      const bool isOpen = seen[wifiSel].open;

      drawFooter("joining...");
      switch (wifiprov::pick(ssid, isOpen)) {
        case wifiprov::PICK_JOINED:
          wifiNote = "joined and saved";
          // The relay was talking over the old network, if any.
          ws.disconnect();
          ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
          break;
        case wifiprov::PICK_FAILED:
          wifiNote = "could not join";
          break;
        case wifiprov::PICK_NEEDS_PASS:
          // Secured and unknown: type it here. The portal is still available
          // from a failed boot join, but needing a phone to change network in
          // the middle of a field is exactly the situation this avoids.
          kbOpen(ssid);
          return;
      }
      wifiNoteAt = millis();
      pageDirty = true;
    }

    // No driving from here, by design.
    if (driving) disarm("left drive page");
    return;
  }

  /* ── drive ────────────────────────────────────────────────── */

  /*
    Which of the two drive sources is active, re-decided every pass.

    The pad wins over tilt when both are held: a deliberate direction press is
    a clearer statement of intent than whatever angle the handset happens to be
    at, and the two fighting would be worse than either.

    Both are dead-man controls — the vector only goes out while something is
    physically held, so releasing everything stops the rover without needing a
    separate stop button.
  */
  float px, py;
  const bool padHeld = padVector(px, py);
  const bool centreHeld = buttons[B_CENTRE].pressed &&
                          millis() - buttons[B_CENTRE].pressedAt >= TAP_MS;

  DriveMode want = DRIVE_NONE;
  if (padHeld) want = DRIVE_PAD;
  else if (centreHeld && mpuReady) want = DRIVE_TILT;

  if (want != DRIVE_NONE && page != PAGE_DRIVE) {
    // Driving from another page would be steering something you cannot see the
    // readout for. Jump to it rather than refusing silently.
    page = PAGE_DRIVE;
    pageDirty = true;
  }

  if (want == DRIVE_NONE) {
    if (driving) disarm("released");
  } else {
    if (!driving) {
      driving = true;
      Serial.printf("[drive] %s\n", want == DRIVE_PAD ? "pad" : "tilt");
    }
    driveMode = want;
    padX = px;
    padY = py;
  }
}

/* ── Setup / loop ─────────────────────────────────────────── */

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] AgriVerse handheld controller");

  setupButtons();

  tft.init();
  tft.setRotation(TFT_ROTATION);
  tft.fillScreen(C_BG);
  tft.setTextSize(1);
  tft.setTextColor(C_INK, C_BG);
  tft.drawString("AgriVerse", 6, 6);
  tft.setTextColor(C_DIM, C_BG);
  tft.drawString("starting...", 6, 20);
  Serial.printf("[tft ] %dx%d\n", tft.width(), tft.height());

  mpuReady = setupMpu();
  if (mpuReady) {
    tft.drawString("levelling - keep still", 6, 34);
    calibrate();
  } else {
    tft.setTextColor(C_BAD, C_BG);
    tft.drawString("MPU not found", 6, 34);
    tft.setTextColor(C_DIM, C_BG);
  }

  /*
    Holding CENTRE through reset wipes the stored network and goes straight to
    setup. Without it, a handset carried to a site whose WiFi has changed would
    need a cable and a laptop to recover — which defeats the point of storing
    credentials at all.

    Read directly rather than through the debouncer: this runs before the first
    readButtons(), so the debounced state is not populated yet.
  */
  const bool forceSetup = digitalRead(BTN_PINS[B_CENTRE]) == LOW;
  if (forceSetup) {
    wifiprov::forget();
    tft.setTextColor(C_ACCENT, C_BG);
    tft.drawString("network cleared", 6, 48);
    tft.setTextColor(C_DIM, C_BG);
  }

  /*
    ── Boot: reconnect, or offer the list ─────────────────────

    Try the stored network first. That is the common case by a wide margin —
    the handset is switched on in the same place it was last used — and it
    should cost nothing but the join.

    If that fails, land on the WiFi page with a scan already running. No
    access point, no phone, no captive portal: pick a network with the pad and
    type the password on screen. Needing a second device to get the first one
    onto a network is exactly the thing that makes a handheld useless in a
    field.
  */
  String storedSsid, storedPass;
  const bool hasStored = !forceSetup && wifiprov::load(storedSsid, storedPass);

  if (hasStored) {
    tft.setTextPadding(SCREEN_W - 12);
    tft.drawString("joining " + storedSsid.substring(0, 12) + "...", 6, 48);
    tft.setTextPadding(0);
  }

  if (!hasStored || !wifiprov::join(storedSsid, storedPass)) {
    Serial.println(hasStored ? "[wifi] stored network unreachable — offering the list"
                             : "[wifi] no stored network — offering the list");
    needsWifi = true;
    page = PAGE_WIFI;
    startScan();
  }

  ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(3000);

  /*
    ── Account ────────────────────────────────────────────────

    Only attempted once there is a network — every call here is HTTPS, and on
    a handset with no WiFi they would each burn their timeout before the pad
    became usable.

    A stored refresh token is traded for a fresh access token rather than
    asking for the password again. Access tokens last an hour, so a handset
    switched on the next morning has a session that is valid and a token that
    is not; without the refresh the user would type their password daily.
  */
  if (!needsWifi) {
    if (supa::loadSession()) {
      Serial.printf("[supa] resuming session for %s\n", supa::userEmail.c_str());
      tft.setTextDatum(TC_DATUM);
      tft.setTextColor(C_DIM, C_BG);
      tft.drawString("restoring session...", SCREEN_W / 2, 60);
      tft.setTextDatum(TL_DATUM);

      if (supa::refresh()) {
        authState = AUTH_IN;
        authEmail = supa::userEmail;
        loadRovers();
        showGreeting();
      } else {
        // refresh() has already cleared the dead session.
        authState = AUTH_OUT;
        page = PAGE_LOGIN;
      }
    } else {
      page = PAGE_LOGIN;
    }
  }

  pageDirty = true;
}

void loop() {
  /*
    Until there is a network, the WiFi page is the only page.

    Nothing else can work without it, and a pad that appears to steer while
    the vectors go nowhere is worse than one that plainly does not. Page
    cycling is suppressed too, so the only way out is to join something.
  */
  if (needsWifi) {
    if (WiFi.isConnected()) {
      needsWifi = false;
      Serial.println("[wifi] connected — carrying on");

      /*
        Sign-in was skipped at boot because there was no network to do it over.
        Now there is, so take the chance — a stored session resumes silently and
        the user never sees a login screen they did not need.
      */
      if (authState == AUTH_OUT && supa::loadSession() && supa::refresh()) {
        authState = AUTH_IN;
        authEmail = supa::userEmail;
        loadRovers();
        showGreeting();
      } else {
        page = authState == AUTH_IN ? PAGE_DRIVE : PAGE_LOGIN;
      }
      pageDirty = true;
    } else if (page != PAGE_WIFI) {
      page = PAGE_WIFI;
      pageDirty = true;
    }
  }

  // The greeting steps aside on its own. Any button also skips it, handled in
  // handleButtons.
  if (page == PAGE_GREET && millis() - greetAt > GREET_MS) goHome();

  ws.loop();
  handleButtons();

  const unsigned long now = millis();

  // Drive input, at a fixed rate. Only while held — a released button sends
  // nothing at all, and the rover's own 1s failsafe catches the rest.
  if (driving && now - lastSend >= SEND_INTERVAL_MS) {
    lastSend = now;

    if (driveMode == DRIVE_PAD) {
      // Full deflection, no smoothing. A pad press is a definite instruction
      // and easing it in would only make the rover feel unresponsive.
      smoothX = padX;
      smoothY = padY;
      sendInput(padX, padY);
    } else {
      float pitch, roll;
      if (readTilt(pitch, roll)) {
        const float x = axisFromTilt(roll - restRoll);
        const float y = axisFromTilt(pitch - restPitch);
        // Light smoothing: a hand is never still, and raw accelerometer noise
        // reaches the motors as audible chatter.
        smoothX = smoothX * 0.7f + x * 0.3f;
        smoothY = smoothY * 0.7f + y * 0.3f;
        sendInput(roundf(smoothX * 100) / 100.0f, roundf(smoothY * 100) / 100.0f);
      }
    }
  }

  /*
    Scanning only happens while the WiFi page is open.

    A scan briefly interrupts the station connection, so running one in the
    background would put a stutter into the drive stream every fifteen seconds
    for a page nobody is looking at.
  */
  if (page == PAGE_WIFI) {
    if (pollScan()) pageDirty = true;
    // Faster while the list is empty. Fifteen seconds is fine for refreshing a
    // list you can already read, but it is a long time to stare at nothing when
    // the handset cannot continue until you pick something.
    const unsigned long wait = seenCount ? RESCAN_MS : 4000;
    if (!scanning && now - lastScanAt >= wait) startScan();
  }

  // Repaint on a timer rather than every loop. The panel is on SPI and a full
  // redraw is visible work; 10Hz is smooth to the eye and leaves the radio
  // plenty of time.
  if (pageDirty || now - lastPaint >= 100) {
    const bool full = pageDirty;
    pageDirty = false;
    lastPaint = now;
    paint(full);
  }

  if (now - lastBeat >= 15000) {
    lastBeat = now;
    Serial.printf("[beat] up %lus, wifi %s, relay %s, page %s\n",
                  now / 1000,
                  WiFi.isConnected() ? "OK" : "DOWN",
                  linked ? "OK" : "DOWN",
                  PAGE_NAME[page]);
  }
}

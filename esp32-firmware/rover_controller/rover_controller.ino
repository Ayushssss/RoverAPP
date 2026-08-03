/*
  AgriVerse Rover — ESP32 firmware

  Joystick, D-pad and the headlight, driving a real H-bridge.
  Everything the board receives is echoed to the serial monitor, so a command
  that arrived and a command that never left the phone never look the same.

  Requires these Arduino libraries:
    • WebSockets      by Markus Sattler
    • ArduinoJson     by Benoit Blanchon

  Board: classic ESP32 or ESP32-S3. Serial monitor at 115200. The motor pins
  below are picked automatically for whichever you flash to — see PIN_L_EN
  etc. if you want the exact numbers before wiring.

  ── Wiring (L298N with the ENA/ENB jumpers FITTED — the default) ──
    Classic ESP32:
      IN1 -> GPIO 26    IN2 -> GPIO 27     (left motor)
      IN3 -> GPIO 32    IN4 -> GPIO 14     (right motor)
    ESP32-S3:
      IN1 -> GPIO 5     IN2 -> GPIO 6      (left motor)
      IN3 -> GPIO 15    IN4 -> GPIO 16     (right motor)

    ⚠ Do NOT wire ENA or ENB. Their jumpers hold them at +5V; connecting a
    3.3V GPIO to that damages the pin and gives motors that work sometimes
    and not others. Speed is controlled by PWM on the IN pins instead.

    GND -> ESP32 GND  ← required, the boards must share a ground
    +12V/VMS -> battery +, and leave the 5V regulator jumper on if you are
    powering the ESP32 from the L298N's 5V pin.

    To use the other style — jumpers removed, speed on ENA/ENB — set
    MOTOR_DRIVE_STYLE to DRIVE_EN_PWM below and wire EN as well.

    ⚠ On the S3, GPIO 26-32 are wired to flash/PSRAM. Reconfiguring any of
    them as a motor pin does not throw an error — it corrupts flash access
    and the board silently stops right after printing "[boot]", which is
    exactly what a boot log with nothing after that line means.
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

/*
  ⚠ Keep this struct above EVERY function definition in this file.

  The Arduino IDE generates function prototypes automatically and inserts them
  immediately before the first function it finds. Any function taking a
  `const Motor&` therefore gets a prototype emitted at that point — so if this
  definition sits below the first function, the generated prototype references
  a type that does not exist yet and the sketch fails with
  "'Motor' does not name a type", pointing at a line that looks perfectly
  correct.
*/
struct Motor {
  const char* name;
  int en, in1, in2;
  int chEn, chIn1, chIn2;   // LEDC channels — only used on core 2.x
};

// ── WiFi ──
const char* WIFI_SSID = "ANANYA";
const char* WIFI_PASS = "satish.m";

// ── Server ──
const char* WS_HOST = "roverapp.onrender.com";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

// ── Status LED ──
// Most ESP32 cores already define this; only fill it in if yours doesn't,
// otherwise the compiler warns about a redefinition.
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

/*
  Many ESP32-S3 boards carry an addressable RGB LED instead of a plain one.
  `digitalWrite` does nothing to a WS2812 — it needs a timed colour word — so
  the headlight drives whichever kind the board actually declares.

  The Espressif core exposes it as `RGB_BUILTIN`; some third-party board
  definitions (Adafruit's among them) call the same pin `PIN_NEOPIXEL`
  instead. Either is enough to detect an RGB status LED.
*/
#if defined(RGB_BUILTIN)
  #define STATUS_LED_PIN RGB_BUILTIN
  #define STATUS_LED_IS_RGB 1
#elif defined(PIN_NEOPIXEL)
  #define STATUS_LED_PIN PIN_NEOPIXEL
  #define STATUS_LED_IS_RGB 1
#else
  #define STATUS_LED_IS_RGB 0
#endif

void setStatusLed(bool on) {
#if STATUS_LED_IS_RGB
  neopixelWrite(STATUS_LED_PIN, on ? 40 : 0, on ? 30 : 0, on ? 8 : 0);
#else
  digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
#endif
}

/* ══════════════════ Motor driver ══════════════════ */

/*
  Two independent choices: how the board is *wired*, and what kind of bridge
  it is. They were tangled together before, which meant picking the jumpered
  wiring style silently also picked a PWM frequency meant for MOSFET drivers.

  ── Wiring style ──────────────────────────────────────────────
  EN_PWM  speed on ENA/ENB, direction on INx.
          Requires the ENA/ENB jumpers REMOVED and those pins wired to the
          ESP32.

  IN_PWM  speed on the INx pins themselves, ENA/ENB tied high by their
          jumpers. Nothing drives EN, so LEAVE THE ENA/ENB PINS UNWIRED —
          with the jumpers fitted they sit at +5V, and connecting a 3.3V
          GPIO to that damages the pin and behaves intermittently.
*/
#define DRIVE_EN_PWM  1
#define DRIVE_IN_PWM  2

#define MOTOR_DRIVE_STYLE  DRIVE_IN_PWM

/*
  ── Bridge type ───────────────────────────────────────────────
  Sets the PWM frequency, independently of the wiring above.
*/
#define BRIDGE_BIPOLAR 1   // L298N — slow switching, needs a low frequency
#define BRIDGE_MOSFET  2   // TB6612, DRV8833, L9110S, MX1508

#define MOTOR_BRIDGE  BRIDGE_BIPOLAR

/*
  Pin choice matters, and the safe set is not the same chip to chip:

  Classic ESP32  — 34-39 are input-only (digitalWrite on them does nothing),
                   6-11 are wired to the flash chip, 2 is the onboard LED.
  ESP32-S3       — 26-32 are wired to flash/PSRAM (reconfiguring them can
                   corrupt flash access outright, which is why that failure
                   shows no error and just stops), 22-25 do not exist on
                   WROOM/WROOM-1 modules, 19/20 are the USB D-/D+ pins on
                   boards using native USB, 0/3/45/46 are boot straps.

  Picked automatically below so the same sketch is correct on either board —
  no pins to hand-edit when you switch hardware.
*/
#if defined(CONFIG_IDF_TARGET_ESP32S3)
  // Left motor
  #define PIN_L_EN   4    // ENA — unused, leave unwired, when style is IN_PWM
  #define PIN_L_IN1  5
  #define PIN_L_IN2  6
  // Right motor
  #define PIN_R_EN   7    // ENB
  #define PIN_R_IN1  15
  #define PIN_R_IN2  16
#else
  // Left motor
  #define PIN_L_EN   25   // ENA
  #define PIN_L_IN1  26
  #define PIN_L_IN2  27
  // Right motor
  #define PIN_R_EN   33   // ENB
  #define PIN_R_IN1  32
  #define PIN_R_IN2  14
#endif

#if MOTOR_BRIDGE == BRIDGE_BIPOLAR
// The L298N is a bipolar bridge with slow switching; past ~10kHz it wastes
// most of the battery as heat. 5kHz is the usual compromise — a faint whine,
// but it stays cool. This applies whichever wiring style is in use.
const int PWM_FREQ = 5000;
#else
// MOSFET bridges switch fast enough to run above hearing.
const int PWM_FREQ = 20000;
#endif

const int PWM_BITS = 8;
const int PWM_MAX  = (1 << PWM_BITS) - 1;

/** Below this the stick is treated as centred — noise shouldn't creep. */
const float DEADBAND = 0.08f;
/** Gearmotors buzz instead of turning below roughly a quarter duty. */
const int MIN_DUTY = 60;

/**
 * Cut the motors if nothing has been heard for this long. The phone repeats
 * the stick position about four times a second while it is held, so a gap
 * this size means the link died — not that you stopped moving your thumb.
 *
 * It also makes a D-pad press a timed nudge rather than a command to drive
 * away forever.
 */
const unsigned long FAILSAFE_MS = 1000;

Motor motorLeft  = { "L", PIN_L_EN, PIN_L_IN1, PIN_L_IN2, 0, 1, 2 };
Motor motorRight = { "R", PIN_R_EN, PIN_R_IN1, PIN_R_IN2, 3, 4, 5 };

// The LEDC API lost its channel argument in ESP32 Arduino core 3.0. Supporting
// both means this sketch compiles whichever core is installed.
#ifndef ESP_ARDUINO_VERSION_MAJOR
#define ESP_ARDUINO_VERSION_MAJOR 2
#endif

static void pwmSetup(int pin, int channel) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcAttach(pin, PWM_FREQ, PWM_BITS);
#else
  ledcSetup(channel, PWM_FREQ, PWM_BITS);
  ledcAttachPin(pin, channel);
#endif
}

static void pwmWrite(int pin, int channel, int duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcWrite(pin, duty);
#else
  (void)pin;
  ledcWrite(channel, duty);
#endif
}

WebSocketsClient ws;
bool ledState = false;

unsigned long lastRx = 0;
unsigned long lastBeat = 0;
unsigned long lastDrive = 0;
unsigned long lastDriveLog = 0;
bool motorsLive = false;

void setupMotor(const Motor& m) {
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  pinMode(m.in1, OUTPUT);
  pinMode(m.in2, OUTPUT);
  digitalWrite(m.in1, LOW);
  digitalWrite(m.in2, LOW);
  pwmSetup(m.en, m.chEn);
  pwmWrite(m.en, m.chEn, 0);
#else
  pwmSetup(m.in1, m.chIn1);
  pwmSetup(m.in2, m.chIn2);
  pwmWrite(m.in1, m.chIn1, 0);
  pwmWrite(m.in2, m.chIn2, 0);
#endif
}

/** `speed` is -1..1. Sign is direction, magnitude is throttle. */
void setMotor(const Motor& m, float speed) {
  const float mag = fabsf(speed);
  int duty = 0;
  if (mag > DEADBAND) {
    // Mapped onto MIN_DUTY..PWM_MAX rather than 0..PWM_MAX, so the first
    // millimetre of stick travel actually moves the rover.
    duty = (int)(MIN_DUTY + (PWM_MAX - MIN_DUTY) * mag);
    duty = constrain(duty, 0, PWM_MAX);
  }
  const bool forward = speed > 0;

#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  if (duty == 0) {
    // Both low is coast. Both high would brake, which is harsher than a rover
    // needs and stresses the gearbox.
    digitalWrite(m.in1, LOW);
    digitalWrite(m.in2, LOW);
    pwmWrite(m.en, m.chEn, 0);
  } else {
    digitalWrite(m.in1, forward ? HIGH : LOW);
    digitalWrite(m.in2, forward ? LOW : HIGH);
    pwmWrite(m.en, m.chEn, duty);
  }
#else
  pwmWrite(m.in1, m.chIn1, forward ? duty : 0);
  pwmWrite(m.in2, m.chIn2, forward ? 0 : duty);
#endif
}

void stopMotors() {
  setMotor(motorLeft, 0);
  setMotor(motorRight, 0);
  motorsLive = false;
}

// ── Drive output ─────────────────────────────────────────────
// The app streams the analog stick as { type: "joystick", x, y } with both
// axes normalised to -1..1. The D-pad arrives as discrete commands and is
// routed through here too, at full deflection.
void applyDrive(float x, float y) {
  lastDrive = millis();

  // Differential mixing: forward is common to both tracks, turn is
  // differential. Clamped so a diagonal can't ask for more than full power.
  const float left  = constrain(y + x, -1.0f, 1.0f);
  const float right = constrain(y - x, -1.0f, 1.0f);

  setMotor(motorLeft, left);
  setMotor(motorRight, right);
  motorsLive = fabsf(left) > DEADBAND || fabsf(right) > DEADBAND;

  // The stick arrives ~25 times a second; logging every frame would bury
  // everything else in the monitor.
  if (millis() - lastDriveLog > 250) {
    lastDriveLog = millis();
    Serial.printf("[drive] x=%.2f y=%.2f -> L=%.2f R=%.2f\n", x, y, left, right);
  }
}

// ── Command dispatch ─────────────────────────────────────────
void handleCommand(const char* cmd, int value) {
  if (strcmp(cmd, "light") == 0) {
    // The app sends the state it switched to, so follow it rather than
    // flipping locally — one dropped command would otherwise leave the phone
    // and the board permanently inverted.
    ledState = value != 0;
    setStatusLed(ledState);
    Serial.printf("[cmd] light -> %s\n", ledState ? "ON" : "OFF");
  }
  else if (strcmp(cmd, "stop") == 0) {
    Serial.println("[cmd] stop");
    stopMotors();
  }
  else if (strcmp(cmd, "forward") == 0)  { Serial.println("[cmd] forward");  applyDrive(0,  1); }
  else if (strcmp(cmd, "backward") == 0) { Serial.println("[cmd] backward"); applyDrive(0, -1); }
  else if (strcmp(cmd, "left") == 0)     { Serial.println("[cmd] left");     applyDrive(-1, 0); }
  else if (strcmp(cmd, "right") == 0)    { Serial.println("[cmd] right");    applyDrive(1,  0); }
  else {
    Serial.printf("[cmd] UNHANDLED \"%s\" (value %d)\n", cmd, value);
  }
}

// ── WebSocket events ─────────────────────────────────────────
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[ws] disconnected — motors stopped, retrying");
      // Never keep driving into a dead link.
      stopMotors();
      setStatusLed(false);
      ledState = false;
      break;

    case WStype_CONNECTED: {
      Serial.println("[ws] connected");
      // Announce ourselves so the server can route this rover's commands.
      StaticJsonDocument<128> doc;
      doc["type"] = "register";
      doc["macAddress"] = WiFi.macAddress();
      String msg;
      serializeJson(doc, msg);
      ws.sendTXT(msg);
      Serial.printf("[ws] sent registration for %s\n", WiFi.macAddress().c_str());
      break;
    }

    case WStype_TEXT: {
      lastRx = millis();

      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) {
        Serial.printf("[rx] bad JSON: %s\n", err.c_str());
        return;
      }

      const char* msgType = doc["type"];
      if (!msgType) {
        Serial.println("[rx] message has no \"type\" — ignored");
        return;
      }

      if (strcmp(msgType, "joystick") == 0) {
        // Not echoed raw: at 25Hz it would scroll everything else away.
        applyDrive(doc["x"] | 0.0f, doc["y"] | 0.0f);
      }
      else if (strcmp(msgType, "command") == 0) {
        // The rawest possible evidence that something arrived. If this never
        // appears, the problem is upstream of the board.
        Serial.printf("[rx] %.*s\n", (int)length, (const char*)payload);
        const char* cmd = doc["command"];
        if (!cmd) {
          Serial.println("[rx] command message has no \"command\" field");
          return;
        }
        handleCommand(cmd, doc["value"] | 1);
      }
      else if (strcmp(msgType, "registered") == 0) {
        Serial.println("[ws] server confirmed registration");
      }
      else {
        Serial.printf("[rx] unknown message type \"%s\"\n", msgType);
      }
      break;
    }

    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] AgriVerse Rover");
#if defined(CONFIG_IDF_TARGET_ESP32S3)
  Serial.println("[boot] chip: ESP32-S3 — using S3-safe motor pins");
#else
  Serial.println("[boot] chip: ESP32 — using classic pin map");
#endif
  Serial.printf("[boot] status LED: %s\n", STATUS_LED_IS_RGB ? "RGB (neopixelWrite)" : "plain (digitalWrite)");

#if !STATUS_LED_IS_RGB
  // The RGB LED is driven over RMT by neopixelWrite() — it needs no pinMode,
  // and setting one on the same pin as some boards' status pixel has been
  // known to fight the driver.
  pinMode(LED_BUILTIN, OUTPUT);
#endif
  setStatusLed(false);

  setupMotor(motorLeft);
  setupMotor(motorRight);
  stopMotors();
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  Serial.printf("[motor] ready, speed on EN — L(en %d, in %d/%d) R(en %d, in %d/%d) @ %dHz\n",
                PIN_L_EN, PIN_L_IN1, PIN_L_IN2,
                PIN_R_EN, PIN_R_IN1, PIN_R_IN2, PWM_FREQ);
  Serial.println("[motor] the ENA/ENB jumpers must be REMOVED for this style");
#else
  Serial.printf("[motor] ready, speed on IN — L(in %d/%d) R(in %d/%d) @ %dHz\n",
                PIN_L_IN1, PIN_L_IN2, PIN_R_IN1, PIN_R_IN2, PWM_FREQ);
  Serial.println("[motor] ENA/ENB jumpers FITTED — leave those pins unwired");
#endif

  // ── WiFi ──
  Serial.printf("[wifi] connecting to \"%s\"", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] connected — IP %s, MAC %s\n",
                WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str());
  Serial.println("[wifi] ^ register this MAC in the app to pair this rover");

  // ── Clock ──
  // TLS certificate validation fails without a correct clock, so the
  // WebSocket connection cannot be opened until NTP has resolved.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[ntp] syncing");
  time_t now = 0;
  while (now < 100000) {
    time(&now);
    delay(500);
    Serial.print(".");
  }
  Serial.println(" done");

  // ── WebSocket ──
  Serial.printf("[ws] connecting to wss://%s%s\n", WS_HOST, WS_PATH);
  ws.beginSslWithBundle(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);
}

void loop() {
  ws.loop();

  const unsigned long now = millis();

  // Failsafe. Anything that stops the stream — WiFi dropping, the phone
  // locking, the server restarting — has to stop the rover, not leave it
  // driving on its last instruction.
  if (motorsLive && now - lastDrive > FAILSAFE_MS) {
    Serial.println("[failsafe] no drive command in 1s — motors stopped");
    stopMotors();
  }

  // Heartbeat: proves the sketch is alive and the link is up even when the
  // phone is sending nothing, so silence reads as "no commands" rather than
  // "board hung".
  if (now - lastBeat >= 15000) {
    lastBeat = now;
    if (lastRx == 0) {
      Serial.printf("[beat] up %lus, WiFi %s, nothing received yet\n",
                    now / 1000, WiFi.isConnected() ? "OK" : "DOWN");
    } else {
      Serial.printf("[beat] up %lus, WiFi %s, last message %lus ago\n",
                    now / 1000, WiFi.isConnected() ? "OK" : "DOWN",
                    (now - lastRx) / 1000);
    }
  }
}

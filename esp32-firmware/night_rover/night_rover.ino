/*
  AgriVerse Night Rover — ESP32 firmware

  The same drive logic and link as rover_controller.ino, with the hardware a
  rover needs to work after dark: a 12V headlight, an ultrasonic range finder
  and an IR obstacle sensor.

  It registers with the relay on its own MAC, so it is a separate rover in the
  app and can be driven from the phone, the browser or the handheld with no
  change to any of them.

  Requires these Arduino libraries:
    • WebSockets      by Markus Sattler
    • ArduinoJson     by Benoit Blanchon

  Board: classic ESP32 or ESP32-S3. Serial monitor at 115200.

  ══════════════════════════════════════════════════════════════
   WIRING
  ══════════════════════════════════════════════════════════════

  ── L298N (ENA/ENB jumpers FITTED — the default) ──
    Classic ESP32:
      IN1 -> GPIO 26    IN2 -> GPIO 27     (left motor)
      IN3 -> GPIO 32    IN4 -> GPIO 14     (right motor)
    ESP32-S3:
      IN1 -> GPIO 5     IN2 -> GPIO 6      (left motor)
      IN3 -> GPIO 15    IN4 -> GPIO 16     (right motor)

    ⚠ Do NOT wire ENA or ENB. Their jumpers hold them at +5V; connecting a
    3.3V GPIO to that damages the pin and gives motors that work sometimes and
    not others. Speed is PWM on the IN pins instead.

    GND -> ESP32 GND  ← required, the boards must share a ground
    +12V -> battery +

  ── HC-SR04 ultrasonic ──
      VCC  -> 5V        (it is unreliable at 3.3V — the transmit burst is weak)
      GND  -> GND
      TRIG -> GPIO 18   (S3: 17)
      ECHO -> GPIO 34   (S3: 18)  ⚠ THROUGH A DIVIDER, see below

    ⚠ ECHO IDLES AT 5V AND THE ESP32 IS A 3.3V PART. Wired straight to a pin
    it exceeds the absolute maximum rating. It often appears to work, because
    the protection diodes conduct and clamp it — while being slowly destroyed.
    The failure arrives weeks later as a pin that reads randomly.

    Two resistors fix it:

        ECHO ──┬── 1k ──┬────────> GPIO 34
               │        │
               │       2k
               │        │
               └────────┴──────── GND

    5V x 2k/(1k+2k) = 3.3V. Any 1:2 ratio works — 10k/20k is fine and draws
    less. On the classic ESP32, GPIO 34 is input-only, which is a deliberate
    choice: nothing can accidentally configure it as an output and drive it
    into the divider.

  ── IR obstacle sensor (the 3-pin module with a pot) ──
      VCC -> 3V3        ⚠ 3.3V, NOT 5V — see below
      GND -> GND
      OUT -> GPIO 23    (S3: 8)

    ⚠ Powered from 5V, its OUT swings to 5V and needs a divider exactly like
    ECHO. Powered from 3V3 it swings to 3.3V and connects directly. These
    modules run fine at 3.3V, so use 3V3 and skip the resistors.

    The output is active LOW: LOW means something is in front of it. The pot
    sets the range, usually 2-30cm. INPUT_PULLUP is enabled, so a disconnected
    sensor reads HIGH — "clear" — rather than jamming the rover permanently.

  ── 12V LED headlight ──
    A GPIO sources 12mA at 3.3V. A 12V LED array wants an order of magnitude
    more, at four times the voltage. Wiring it to a pin destroys the pin and
    the light stays dark. It needs a switch the GPIO can command:

        GPIO 21 ──220R──┬── GATE ┐
                        │        │  IRLZ44N (LOGIC-LEVEL N-MOSFET)
                       10k       │
                        │        ├── DRAIN ── LED (-)
                       GND       │            LED (+) ── +12V
                                 └── SOURCE ── GND (shared with the ESP32)

    • LOGIC-LEVEL matters. A plain IRF540 needs ~10V on the gate to turn on
      fully; at 3.3V it sits half-on, drops several volts across itself and
      runs hot enough to fail. IRLZ44N, IRL540N and AO3400 are logic-level.
    • The 10k gate pulldown holds the light OFF during reset, when the pin
      floats. Without it the headlight flickers on at every boot.
    • The 220R limits the current spike into the gate capacitance.

    A relay module works too and needs no resistors, but it cannot dim and it
    clicks on every change.

  ══════════════════════════════════════════════════════════════

  ⚠ Do not power the ESP32 from the L298N's 5V regulator while driving 12V
  motors. It is a linear regulator dropping 12V to 5V, and the motor inrush
  browns it out — the board resets mid-turn and the rover keeps rolling until
  the failsafe catches it. Give the ESP32 its own supply.
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

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
const char* WIFI_SSID = "Ananya";
const char* WIFI_PASS = "satish.m";

// ── Server ──
const char* WS_HOST = "roverapp.duckdns.org";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

/* ══════════════════ Pins ══════════════════ */

/*
  Picked automatically per chip, so the same sketch is correct on either board.

  Classic ESP32  — 34-39 are input-only, 6-11 are wired to the flash chip.
  ESP32-S3       — 26-32 are wired to flash/PSRAM, and reconfiguring one does
                   not error, it corrupts flash access and the board stops
                   dead right after printing "[boot]".
*/
#if defined(CONFIG_IDF_TARGET_ESP32S3)
  #define PIN_L_EN   4    // ENA — unused, leave unwired, when style is IN_PWM
  #define PIN_L_IN1  5
  #define PIN_L_IN2  6
  #define PIN_R_EN   7    // ENB
  #define PIN_R_IN1  15
  #define PIN_R_IN2  16

  #define PIN_TRIG   17
  #define PIN_ECHO   18
  #define PIN_IR     8
  #define PIN_LIGHT  21
#else
  #define PIN_L_EN   25   // ENA
  #define PIN_L_IN1  26
  #define PIN_L_IN2  27
  #define PIN_R_EN   33   // ENB
  #define PIN_R_IN1  32
  #define PIN_R_IN2  14

  #define PIN_TRIG   18
  // Input-only on the classic ESP32, which is what we want: nothing can
  // configure it as an output and drive it back into the divider.
  #define PIN_ECHO   34
  #define PIN_IR     23
  #define PIN_LIGHT  21
#endif

/* ══════════════════ Motor driver ══════════════════ */

/*
  Two independent choices: how the board is *wired*, and what kind of bridge
  it is.

  EN_PWM  speed on ENA/ENB, direction on INx. Jumpers REMOVED, EN wired.
  IN_PWM  speed on the INx pins, ENA/ENB tied high by their jumpers. Nothing
          drives EN, so LEAVE THOSE PINS UNWIRED — with the jumpers fitted
          they sit at +5V and a 3.3V GPIO on that damages the pin.
*/
#define DRIVE_EN_PWM  1
#define DRIVE_IN_PWM  2

#define MOTOR_DRIVE_STYLE  DRIVE_IN_PWM

#define BRIDGE_BIPOLAR 1   // L298N — slow switching, needs a low frequency
#define BRIDGE_MOSFET  2   // TB6612, DRV8833, L9110S, MX1508

#define MOTOR_BRIDGE  BRIDGE_BIPOLAR

#if MOTOR_BRIDGE == BRIDGE_BIPOLAR
// The L298N is a bipolar bridge with slow switching; past ~10kHz it wastes
// most of the battery as heat. 5kHz is the usual compromise — a faint whine,
// but it stays cool.
const int PWM_FREQ = 5000;
#else
const int PWM_FREQ = 20000;
#endif

const int PWM_BITS = 8;
const int PWM_MAX  = (1 << PWM_BITS) - 1;

/** Below this the stick is treated as centred — noise shouldn't creep. */
const float DEADBAND = 0.08f;
/** Gearmotors buzz instead of turning below roughly a quarter duty. */
const int MIN_DUTY = 60;

/**
 * Cut the motors if nothing has been heard for this long. The app repeats the
 * stick position about four times a second while it is held, so a gap this
 * size means the link died — not that you stopped moving your thumb.
 */
const unsigned long FAILSAFE_MS = 1000;

Motor motorLeft  = { "L", PIN_L_EN, PIN_L_IN1, PIN_L_IN2, 0, 1, 2 };
Motor motorRight = { "R", PIN_R_EN, PIN_R_IN1, PIN_R_IN2, 3, 4, 5 };

/** Channel 6: 0-5 belong to the two motors. */
const int LIGHT_CHANNEL = 6;

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

/* ══════════════════ State ══════════════════ */

WebSocketsClient ws;

/** Headlight brightness, 0-255. Non-zero is "on" for reporting purposes. */
int lightLevel = 0;

unsigned long lastRx = 0;
/** Cumulative WebSocket drops — the trend is what distinguishes the faults. */
unsigned long wsDrops = 0;
unsigned long lastBeat = 0;
unsigned long lastDrive = 0;
unsigned long lastDriveLog = 0;
unsigned long lastTelemetry = 0;
bool motorsLive = false;

/* ── Obstacle sensing ────────────────────────────────────────

   Both sensors face forward and answer different questions. The ultrasonic
   sees far but has a blind spot in the first few centimetres and misses
   anything soft or angled — sound at 45 degrees reflects away rather than
   back. The IR sees only centimetres but does not care about shape, so it
   catches exactly what the ultrasonic loses. Either one alone leaves a gap
   the rover drives into.
*/

/** Stop forward motion closer than this. Roughly a rover length. */
const float STOP_CM = 25.0f;

/** Anything past this is treated as no reading — the HC-SR04's useful limit. */
const float MAX_CM = 400.0f;

/**
 * Set false to drive with the sensors reporting but not intervening.
 *
 * Worth having as a switch rather than an edit: a mis-aimed sensor that
 * reports 3cm forever makes the rover look completely dead, and flipping this
 * is how you tell that apart from a drive fault in ten seconds.
 */
const bool AVOIDANCE_ENABLED = true;

/** HC-SR04 needs ~60ms between pings or the previous echo is still returning. */
const unsigned long PING_INTERVAL_MS = 60;

volatile unsigned long echoRiseUs = 0;
volatile unsigned long echoWidthUs = 0;
volatile bool echoReady = false;

unsigned long lastPingAt = 0;
/** When a valid echo last came back — used to expire the reading. */
unsigned long lastEchoAt = 0;
/** Last good distance, or -1 for "nothing came back". */
float distanceCm = -1.0f;
bool irBlocked = false;
unsigned long lastBlockLog = 0;

/* ── motor slew ──────────────────────────────────────────────
   Applied throttle, ramped toward the target rather than jumped to it.

   A stick that goes from centre to full asks for duty 0 -> 225 in one write,
   and the inrush from a stalled-rotor start is what drags the rail down and
   resets the board. Easing in over a fifth of a second costs nothing you can
   feel and removes the spike.

   Ramping is deliberately one-way: stopping is instant. A delayed stop is a
   rover that keeps going after you let go, which is never the safer trade.
*/
const unsigned long SLEW_TICK_MS = 10;
/** Per tick. 0.05 at 10ms reaches full throttle in ~200ms. */
const float SLEW_STEP = 0.05f;

float targetLeft = 0, targetRight = 0;
float appliedLeft = 0, appliedRight = 0;
unsigned long lastSlew = 0;

/**
 * Why the board last restarted.
 *
 * Worth printing on every boot. A brownout looks exactly like a crash from the
 * outside — the serial monitor fills with the ROM bootloader's output at 74880
 * baud, which reads as garbage at 115200 and tells you nothing.
 */
static const char* resetReasonText(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON:   return "power-on";
    case ESP_RST_EXT:       return "external reset pin";
    case ESP_RST_SW:        return "software restart";
    case ESP_RST_PANIC:     return "PANIC — exception or assert";
    case ESP_RST_INT_WDT:   return "interrupt watchdog";
    case ESP_RST_TASK_WDT:  return "task watchdog";
    case ESP_RST_WDT:       return "watchdog";
    case ESP_RST_DEEPSLEEP: return "woke from deep sleep";
    case ESP_RST_BROWNOUT:  return "BROWNOUT — the supply collapsed";
    case ESP_RST_SDIO:      return "SDIO";
    default:                return "unknown";
  }
}

/* ══════════════════ Headlight ══════════════════ */

/**
 * @param level 0-255. Driven through LEDC rather than digitalWrite so the
 *        light dims — useful on a night rover, where full brightness close to
 *        a wall blows out the camera exposure and hides the obstacle.
 */
void setLight(int level) {
  lightLevel = constrain(level, 0, PWM_MAX);
  pwmWrite(PIN_LIGHT, LIGHT_CHANNEL, lightLevel);
}

/* ══════════════════ Ultrasonic ══════════════════ */

/*
  Interrupt-driven rather than pulseIn().

  pulseIn blocks until the echo returns or it times out — up to 25ms for a
  reading at maximum range, and the full timeout when nothing comes back at
  all. That delay lands directly on top of ws.loop() and the failsafe check,
  so the rover would ignore a stop command for as long as it was listening for
  an echo. Stopping distance is measured in milliseconds here.

  Timing the edges in an ISR costs microseconds and leaves the loop free.
*/
void IRAM_ATTR onEchoEdge() {
  if (digitalRead(PIN_ECHO)) {
    echoRiseUs = micros();
  } else if (echoRiseUs != 0) {
    echoWidthUs = micros() - echoRiseUs;
    echoRiseUs = 0;
    echoReady = true;
  }
}

void pingUltrasonic() {
  // 10us high starts a burst of eight 40kHz cycles.
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
}

void readUltrasonic() {
  const unsigned long now = millis();

  if (echoReady) {
    noInterrupts();
    const unsigned long width = echoWidthUs;
    echoReady = false;
    interrupts();

    /*
      Sound covers 1cm out and back in ~58us at room temperature. The divisor
      shifts about 0.2% per degree C, which is far below what a 40kHz beam
      bouncing off an irregular surface resolves — not worth compensating.
    */
    const float cm = width / 58.0f;
    if (cm > 0 && cm <= MAX_CM) {
      distanceCm = cm;
      lastEchoAt = now;
    }
  }

  /*
    Expire a reading nothing has confirmed lately.

    Out of range, the HC-SR04 sends no falling edge at all — so without this
    the last good measurement simply persists. A 10cm reading taken as the
    rover reversed away from a wall would then keep forward motion blocked in
    an empty room, with the sensor working perfectly and reporting something
    that was true a minute ago. Silence has to mean "clear", not "unchanged".

    Three ping intervals, so one absorbed echo does not flicker the state.
  */
  if (distanceCm > 0 && now - lastEchoAt > PING_INTERVAL_MS * 3) {
    distanceCm = -1.0f;
  }

  if (now - lastPingAt >= PING_INTERVAL_MS) {
    lastPingAt = now;
    pingUltrasonic();
  }
}

/** True when either sensor says something is directly ahead. */
bool obstacleAhead() {
  // Active LOW, and INPUT_PULLUP means an unplugged sensor reads clear rather
  // than jamming the rover.
  irBlocked = digitalRead(PIN_IR) == LOW;
  const bool tooClose = distanceCm > 0 && distanceCm < STOP_CM;
  return irBlocked || tooClose;
}

/* ══════════════════ Motors ══════════════════ */

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
  // Targets *and* applied values, so the slew has nothing left to ramp toward.
  // Clearing only the target would let the rover coast down over 200ms after
  // an emergency stop.
  targetLeft = targetRight = 0;
  appliedLeft = appliedRight = 0;
  setMotor(motorLeft, 0);
  setMotor(motorRight, 0);
  motorsLive = false;
}

/** Move one applied value toward its target, limited on the way up only. */
static float slew(float applied, float target) {
  // Toward zero, or reversing through zero, go immediately: both are the rover
  // slowing down, and neither draws the inrush this exists to limit.
  if (fabsf(target) < fabsf(applied) || (target * applied) < 0) return target;
  if (target > applied) return fminf(applied + SLEW_STEP, target);
  if (target < applied) return fmaxf(applied - SLEW_STEP, target);
  return target;
}

/**
 * Advance the motors toward what was last asked for.
 *
 * Driven from loop() on a fixed tick rather than from the message handler,
 * because the ramp has to keep moving between messages — the app sends a held
 * stick only four times a second, and a ramp that only advanced on arrival
 * would take a second and a half to reach full throttle.
 */
void updateMotors() {
  appliedLeft  = slew(appliedLeft,  targetLeft);
  appliedRight = slew(appliedRight, targetRight);
  setMotor(motorLeft,  appliedLeft);
  setMotor(motorRight, appliedRight);
}

/* ══════════════════ The mixer ══════════════════ */

/**
 * Turn a stick vector into two track speeds.
 *
 * Differential (tank) mixing: forward is common to both tracks, turn is
 * differential. `y + x` and `y - x` is the whole idea, and the only real
 * question is what to do when that lands outside the range a motor can accept.
 *
 * ── Why not constrain() each side ─────────────────────────────
 *
 * The obvious answer clips each channel on its own:
 *
 *     left  = constrain(y + x, -1, 1);
 *     right = constrain(y - x, -1, 1);
 *
 * which is wrong in a way that only shows up at speed. What steers a tracked
 * vehicle is the DIFFERENCE between the tracks, and clipping one side changes
 * that difference:
 *
 *     y=1.0, x=0.5   asks for  1.5 : 0.5   a 3:1 differential
 *     clipped         gives     1.0 : 0.5   a 2:1 differential
 *
 * So the rover understeers, and it understeers more the faster it is going —
 * the turn you get at half throttle is not the turn you get at full throttle
 * for the same stick position. That is the opposite of what a driver expects,
 * and it is worst at exactly the moment it matters most.
 *
 * ── What this does instead ────────────────────────────────────
 *
 * Divide both sides by the larger magnitude whenever it exceeds 1. The pair
 * keeps its ratio exactly and simply scales down to fit:
 *
 *     y=1.0, x=0.5   ->  1.5 : 0.5  ->  1.0 : 0.333   still 3:1
 *
 * The commanded turn radius is then the same at every throttle, and full
 * stick still means full power on the outer track. You trade a little forward
 * speed in hard turns for a turn that behaves predictably, which is the right
 * way round.
 */
static void mixDrive(float x, float y, float& left, float& right) {
  left  = y + x;
  right = y - x;

  const float peak = fmaxf(fabsf(left), fabsf(right));
  if (peak > 1.0f) {
    left  /= peak;
    right /= peak;
  }
}

// ── Drive output ─────────────────────────────────────────────
// The app streams the analog stick as { type: "joystick", x, y } with both
// axes normalised to -1..1. The D-pad arrives as discrete commands and is
// routed through here too, at full deflection.
void applyDrive(float x, float y) {
  lastDrive = millis();

  /*
    Refuse forward motion into an obstacle, but only the forward part.

    Zeroing the whole vector would leave the rover stuck against a wall with
    no way to drive off it — every escape command is also refused, including
    reverse. Dropping just the forward component keeps reverse and both pivot
    directions available, so the rover can always turn or back away from
    whatever it found.
  */
  if (AVOIDANCE_ENABLED && y > 0 && obstacleAhead()) {
    if (millis() - lastBlockLog > 500) {
      lastBlockLog = millis();
      Serial.printf("[avoid] forward blocked — %s%s(%.1fcm)\n",
                    irBlocked ? "IR " : "",
                    (distanceCm > 0 && distanceCm < STOP_CM) ? "range " : "",
                    distanceCm);
    }
    y = 0;
  }

  float left, right;
  mixDrive(x, y, left, right);

  // Set the target only. `updateMotors` on its own tick is what actually
  // reaches the pins, so the ramp survives the gaps between messages.
  targetLeft = left;
  targetRight = right;
  motorsLive = fabsf(left) > DEADBAND || fabsf(right) > DEADBAND;

  // The stick arrives ~25 times a second; logging every frame would bury
  // everything else in the monitor.
  if (millis() - lastDriveLog > 250) {
    lastDriveLog = millis();
    Serial.printf("[drive] x=%.2f y=%.2f -> L=%.2f R=%.2f (applied %.2f/%.2f) range=%.0fcm\n",
                  x, y, left, right, appliedLeft, appliedRight, distanceCm);
    // Pushed out now rather than when the buffer happens to fill. If the next
    // thing that happens is a brownout, this is the line that says what the
    // rover was being asked to do when the power gave out.
    Serial.flush();
  }
}

/* ══════════════════ Telemetry ══════════════════ */

/**
 * Report what the sensors see, in the same shape sensor_hub.ino uses.
 *
 * The console renders any key it is handed, so these arrive as named tiles
 * without a change to the app. -1 becomes "out of range" rather than being
 * sent as a distance, because a literal -1 would render as a reading.
 */
void sendTelemetry() {
  if (!ws.isConnected()) return;

  StaticJsonDocument<256> doc;
  doc["type"] = "telemetry";
  JsonObject readings = doc.createNestedObject("readings");
  if (distanceCm > 0) readings["distanceCm"] = distanceCm;
  readings["obstacle"] = obstacleAhead() ? 1 : 0;
  readings["headlight"] = lightLevel;

  String msg;
  serializeJson(doc, msg);
  ws.sendTXT(msg);
}

// ── Command dispatch ─────────────────────────────────────────
void handleCommand(const char* cmd, int value) {
  if (strcmp(cmd, "light") == 0) {
    /*
      The app sends the state it switched to, so follow it rather than flipping
      locally — one dropped command would otherwise leave the phone and the
      board permanently inverted.

      0 and 1 are off and full, which is what the app sends today. Anything
      larger is taken as a brightness, so a future slider needs no firmware
      change and an old app keeps working unchanged.
    */
    if (value <= 0)       setLight(0);
    else if (value == 1)  setLight(PWM_MAX);
    else                  setLight(constrain(value, 0, PWM_MAX));
    Serial.printf("[cmd] light -> %d/%d\n", lightLevel, PWM_MAX);
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
      // Counted and timestamped. A single drop during startup and a drop every
      // two seconds forever are different faults, and the bare line cannot
      // tell them apart.
      wsDrops++;
      Serial.printf("[ws] disconnected — motors stopped, retrying (drop #%lu at %lus)\n",
                    wsDrops, millis() / 1000);
      if (wsDrops == 5) {
        Serial.println("[ws] repeated drops with no successful session usually means");
        Serial.println("[ws] the TLS handshake is being refused, not the socket.");
      }
      // Never keep driving into a dead link.
      stopMotors();
      // The headlight is left alone deliberately. A rover that loses the link
      // in the dark is a rover you have to walk out and find.
      break;

    case WStype_CONNECTED: {
      Serial.printf("[ws] CONNECTED at %lus — handshake succeeded\n", millis() / 1000);
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
      else if (strcmp(msgType, "telemetry") == 0) {
        // Sibling boards' readings, fanned out by the relay. Nothing to do
        // with them here; named so they do not read as an unknown type.
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
  Serial.println("\n[boot] AgriVerse Night Rover");

  // Printed before anything else can fail. If the last run ended in a brownout
  // this is the only place that says so in plain words — the ROM bootloader's
  // own account comes out at 74880 baud and reads as garbage here.
  {
    const esp_reset_reason_t reason = esp_reset_reason();
    Serial.printf("[boot] last reset: %s\n", resetReasonText(reason));
    if (reason == ESP_RST_BROWNOUT) {
      Serial.println("[boot] ^ the supply could not hold up. Check the battery,");
      Serial.println("[boot]   that the ESP32 is not fed from the L298N 5V pin,");
      Serial.println("[boot]   and that the 12V headlight is not sharing it.");
    }
    Serial.flush();
  }

#if defined(CONFIG_IDF_TARGET_ESP32S3)
  Serial.println("[boot] chip: ESP32-S3 — using S3-safe pins");
#else
  Serial.println("[boot] chip: ESP32 — using classic pin map");
#endif

  // ── Motors ──
  setupMotor(motorLeft);
  setupMotor(motorRight);
  stopMotors();
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  Serial.printf("[motor] ready, speed on EN — L(en %d, in %d/%d) R(en %d, in %d/%d) @ %dHz\n",
                PIN_L_EN, PIN_L_IN1, PIN_L_IN2, PIN_R_EN, PIN_R_IN1, PIN_R_IN2, PWM_FREQ);
  Serial.println("[motor] the ENA/ENB jumpers must be REMOVED for this style");
#else
  Serial.printf("[motor] ready, speed on IN — L(in %d/%d) R(in %d/%d) @ %dHz\n",
                PIN_L_IN1, PIN_L_IN2, PIN_R_IN1, PIN_R_IN2, PWM_FREQ);
  Serial.println("[motor] ENA/ENB jumpers FITTED — leave those pins unwired");
#endif

  // ── Headlight ──
  pwmSetup(PIN_LIGHT, LIGHT_CHANNEL);
  setLight(0);
  Serial.printf("[light] 12V headlight on GPIO %d via MOSFET gate, PWM dimmable\n", PIN_LIGHT);

  // ── Sensors ──
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_ECHO), onEchoEdge, CHANGE);

  // Pull-up so an unplugged sensor reads HIGH — "clear". Without it a floating
  // pin drifts low and the rover refuses to move forward for no visible reason.
  pinMode(PIN_IR, INPUT_PULLUP);

  Serial.printf("[sense] HC-SR04 trig %d / echo %d (echo MUST come through a 1k:2k divider)\n",
                PIN_TRIG, PIN_ECHO);
  Serial.printf("[sense] IR on %d, active LOW, pulled up\n", PIN_IR);
  Serial.printf("[sense] avoidance %s, stop under %.0fcm\n",
                AVOIDANCE_ENABLED ? "ON" : "OFF", STOP_CM);

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
  // TLS certificate validation fails without a correct clock, so the WebSocket
  // connection cannot be opened until NTP has resolved.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[ntp] syncing");
  time_t now = 0;
  /*
    Bounded, not endless. NTP only resolves if the network actually reaches the
    internet. A phone hotspot with mobile data switched off will associate
    perfectly and never sync — and an unbounded loop turns that into a board
    that prints dots forever and looks dead.
  */
  const unsigned long ntpStarted = millis();
  while (now < 100000 && millis() - ntpStarted < 20000) {
    time(&now);
    delay(500);
    Serial.print(".");
  }

  if (now < 100000) {
    Serial.println(" TIMED OUT");
    Serial.println("[ntp] no time source — the network is up but has no internet path.");
    Serial.println("[ntp] on a phone hotspot, check mobile data is actually on.");
    Serial.println("[ntp] continuing anyway; a wrong clock only affects TLS validation.");
  } else {
    Serial.println(" done");
  }

  // ── WebSocket ──
  /*
    Reachability probe, before assuming anything about why a connection fails.
    "Cannot reach our server" and "cannot reach anything" look identical from a
    single failed connect but are different faults. A plain HTTP host, a
    well-known HTTPS host and our own server separate: all TCP dead, port 443
    specifically dead, or just this one host unreachable.
  */
  Serial.printf("[net] gateway %s, DNS %s\n",
                WiFi.gatewayIP().toString().c_str(), WiFi.dnsIP().toString().c_str());

  struct Target { const char* host; uint16_t port; };
  const Target targets[] = {
    { "example.com",    80  },   // plain TCP, no TLS
    { "www.google.com", 443 },   // TLS to a host nobody blocks
    { WS_HOST,          443 },   // our relay
  };

  for (const Target& t : targets) {
    IPAddress ip;
    if (!WiFi.hostByName(t.host, ip)) {
      Serial.printf("[net] %-28s DNS FAILED\n", t.host);
      continue;
    }
    WiFiClient probe;
    const unsigned long started = millis();
    const bool ok = probe.connect(ip, t.port, 6000);
    Serial.printf("[net] %-22s:%-4d %s (%s, %lums)\n",
                  t.host, t.port, ok ? "REACHABLE" : "unreachable",
                  ip.toString().c_str(), millis() - started);
    if (ok) probe.stop();
    delay(200);
  }

  Serial.printf("[ws] connecting to wss://%s%s\n", WS_HOST, WS_PATH);
  /*
    beginSSL rather than beginSslWithBundle. Validating the certificate needs a
    correct clock, and the clock comes from NTP, which needs the very internet
    connection being established. Where NTP is blocked but HTTPS works, bundle
    validation fails against a 1970 date and the socket dies as it opens —
    which looks exactly like the server rejecting it.

    Stated plainly: the connection stays encrypted but the server is no longer
    authenticated, so a machine in the path could impersonate it. For a rover
    on your own network that is an acceptable trade for a link that works
    without a time source.
  */
  ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);
}

void loop() {
  ws.loop();

  const unsigned long now = millis();

  // Kept up to date continuously, not only when a command arrives — the
  // failsafe below and the telemetry both read it, and a reading refreshed
  // only on input would be stale exactly when the rover is coasting to a stop.
  readUltrasonic();

  /*
    Stop if something appears in front while already moving forward.

    applyDrive only screens the commands it is given, which is enough when the
    rover is being steered into a wall but not when a wall walks in front of a
    rover already under way. Both are the same event from the driver's seat.
  */
  if (AVOIDANCE_ENABLED && motorsLive && (targetLeft > 0 || targetRight > 0) && obstacleAhead()) {
    Serial.printf("[avoid] obstacle at %.1fcm while moving — stopped\n", distanceCm);
    stopMotors();
  }

  // Failsafe. Anything that stops the stream — WiFi dropping, the phone
  // locking, the server restarting — has to stop the rover, not leave it
  // driving on its last instruction.
  if (motorsLive && now - lastDrive > FAILSAFE_MS) {
    Serial.println("[failsafe] no drive command in 1s — motors stopped");
    stopMotors();
  }

  // The ramp runs on its own clock so it keeps advancing between messages.
  if (now - lastSlew >= SLEW_TICK_MS) {
    lastSlew = now;
    updateMotors();
  }

  // Sensor readings to the app. 2Hz: fast enough to watch an obstacle
  // approach, slow enough not to compete with the drive stream for airtime.
  if (now - lastTelemetry >= 500) {
    lastTelemetry = now;
    sendTelemetry();
  }

  // Heartbeat: proves the sketch is alive and the link is up even when the
  // phone is sending nothing, so silence reads as "no commands" rather than
  // "board hung".
  if (now - lastBeat >= 15000) {
    lastBeat = now;
    Serial.printf("[beat] up %lus, WiFi %s, range %.0fcm, IR %s, light %d, ",
                  now / 1000, WiFi.isConnected() ? "OK" : "DOWN",
                  distanceCm, irBlocked ? "BLOCKED" : "clear", lightLevel);
    if (lastRx == 0) Serial.println("nothing received yet");
    else             Serial.printf("last message %lus ago\n", (now - lastRx) / 1000);
  }
}

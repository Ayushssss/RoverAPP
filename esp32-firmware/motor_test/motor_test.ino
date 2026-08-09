/*
  AgriVerse Rover — motor bench test

  No WiFi, no WebSocket, no phone. Flash this and the motors run through a
  fixed routine on their own, so a wiring or power fault can be found without
  anything else being able to be at fault.

  Pins are identical to rover_controller.ino — if the rover works here and not
  there, the problem is upstream of the motors.

  ── Wiring ────────────────────────────────────────────────────
    IN1 -> 26   IN2 -> 27      (left)
    IN3 -> 32   IN4 -> 14      (right)

    Battery + -> L298N +12V        Battery - -> L298N GND
    L298N 5V  -> ESP32 VIN         L298N GND -> ESP32 GND   ← must share
    (the 5V pin is only live with the 5V-enable jumper fitted, and only when
     the motor supply is 12V or less)

    ENA/ENB depend on MOTOR_DRIVE_STYLE below, and it must match the board:

      DRIVE_IN_PWM (default)  jumpers FITTED, ENA/ENB wired to NOTHING.
                              Speed rides on the IN pins.
      DRIVE_EN_PWM            jumpers REMOVED, ENA -> 25 and ENB -> 33.

    Getting this backwards is the usual reason motors stay still while the
    serial log looks perfectly healthy — and wiring a 3.3V GPIO to a jumpered
    (+5V) ENA/ENB damages the pin.

  Serial monitor at 115200 — every step is announced before it runs.
*/

#define PIN_L_EN   25
#define PIN_L_IN1  26
#define PIN_L_IN2  27
#define PIN_R_EN   33
#define PIN_R_IN1  32
#define PIN_R_IN2  14

/*
  ── Wiring style ──────────────────────────────────────────────
  Must match how the L298N is actually wired, and it must match
  MOTOR_DRIVE_STYLE in rover_controller.ino or the two sketches will disagree
  about the same board.

  IN_PWM   ENA/ENB jumpers FITTED (shorted to +5V). Speed comes from PWM on the
           IN pins. Nothing may be connected to ENA/ENB — driving a 3.3V GPIO
           into a pin held at +5V damages the pin.

  EN_PWM   ENA/ENB jumpers REMOVED and those pins wired to GPIO 25/33. Speed
           comes from PWM on EN, direction from the IN pins.
*/
#define DRIVE_EN_PWM  1
#define DRIVE_IN_PWM  2

#define MOTOR_DRIVE_STYLE  DRIVE_IN_PWM

/*
  Phase 1 probes each pin with a steady HIGH so it can be metered.

  That is only a *logic* test when the enables are under our control. With the
  jumpers fitted ENA/ENB sit at +5V, so holding IN1 high is not a probe at all —
  it is OUT1 high, OUT2 low, and the motor at full DC with no PWM and no ramp.
  On a supply that cannot take the inrush the board browns out mid-check, which
  looks like a crash and hides the real fault.

  So it is off by default in that mode. Set this to 1 only with the motor
  battery DISCONNECTED and the ESP32 on USB — then the IN pins can be metered
  safely, because there is nothing for the bridge to drive.
*/
#define RUN_PIN_CHECK  0

/*
  Which channel to exercise.

  A board that survives one motor and resets on the other has a fault in that
  channel — a stalled gearbox, a shorted winding, or two output wires touching —
  not a supply too small for the job. Testing them one at a time is what
  separates those, and it needs no rewiring.

  TEST_BOTH   both motors, then both together (the heaviest load)
  TEST_LEFT   left only
  TEST_RIGHT  right only
*/
#define TEST_BOTH   0
#define TEST_LEFT   1
#define TEST_RIGHT  2

#define TEST_MOTORS  TEST_BOTH

const int PWM_FREQ = 5000;
const int PWM_BITS = 8;
const int PWM_MAX  = (1 << PWM_BITS) - 1;

#ifndef ESP_ARDUINO_VERSION_MAJOR
#define ESP_ARDUINO_VERSION_MAJOR 2
#endif

/*
  Declared before the first function on purpose.

  The Arduino builder generates prototypes for every function in a .ino and
  inserts them immediately above the first function definition. A prototype
  mentioning `Motor` therefore has to appear *after* the struct — with this
  block further down the file, the generated prototypes referenced a type that
  did not exist yet and the sketch failed to compile with
  "'Motor' does not name a type". rover_controller.ino declares it early for
  the same reason; keep it that way.
*/
struct Motor { const char* name; int en, in1, in2, ch; };
Motor left  = { "LEFT",  PIN_L_EN, PIN_L_IN1, PIN_L_IN2, 0 };
Motor right = { "RIGHT", PIN_R_EN, PIN_R_IN1, PIN_R_IN2, 1 };

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

void setupMotor(const Motor& m) {
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  pinMode(m.in1, OUTPUT);
  pinMode(m.in2, OUTPUT);
  digitalWrite(m.in1, LOW);
  digitalWrite(m.in2, LOW);
  pwmSetup(m.en, m.ch);
  pwmWrite(m.en, m.ch, 0);
#else
  // Two channels, because with the jumpers fitted the speed lives on the IN
  // pins themselves — one per direction.
  pwmSetup(m.in1, m.ch * 2);
  pwmSetup(m.in2, m.ch * 2 + 1);
  pwmWrite(m.in1, m.ch * 2, 0);
  pwmWrite(m.in2, m.ch * 2 + 1, 0);
#endif
}

void run(const Motor& m, bool forward, int duty) {
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  digitalWrite(m.in1, forward ? HIGH : LOW);
  digitalWrite(m.in2, forward ? LOW : HIGH);
  pwmWrite(m.en, m.ch, duty);
#else
  pwmWrite(m.in1, m.ch * 2, forward ? duty : 0);
  pwmWrite(m.in2, m.ch * 2 + 1, forward ? 0 : duty);
#endif
}

void halt(const Motor& m) {
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  digitalWrite(m.in1, LOW);
  digitalWrite(m.in2, LOW);
  pwmWrite(m.en, m.ch, 0);
#else
  pwmWrite(m.in1, m.ch * 2, 0);
  pwmWrite(m.in2, m.ch * 2 + 1, 0);
#endif
}

/** One motor, one direction, held long enough to see and hear. */
void step(const Motor& m, bool forward, int duty, const char* what) {
  Serial.printf("\n>> %s %s at duty %d/%d — %s\n",
                m.name, forward ? "FORWARD" : "REVERSE", duty, PWM_MAX, what);
  run(m, forward, duty);
  delay(2000);
  halt(m);
  Serial.printf("   %s stopped\n", m.name);
  delay(600);
}

/**
 * Phase 1: prove the ESP32 side works before blaming the driver.
 *
 * Each pin is held high on its own for long enough to get a multimeter probe
 * on it. Every one should read ~3.3V against GND while it is named. A pin
 * that stays at 0V is a dead GPIO or a broken wire; one that reads ~5V is
 * being back-fed by the driver, which means a jumper is still fitted.
 *
 * Runs before the PWM hardware is attached, so these are plain DC levels.
 */
void pinCheck() {
#if MOTOR_DRIVE_STYLE == DRIVE_EN_PWM
  const int count = 6;
  const int pins[6]  = { PIN_L_EN, PIN_L_IN1, PIN_L_IN2, PIN_R_EN, PIN_R_IN1, PIN_R_IN2 };
  const char* names[6] = { "ENA (left enable)", "IN1 (left)", "IN2 (left)",
                           "ENB (right enable)", "IN3 (right)", "IN4 (right)" };
#else
  /*
    ENA/ENB are deliberately absent from this list.

    With the jumpers fitted those pins sit at +5V, and driving a 3.3V GPIO
    against them is the exact fault this sketch exists to rule out — testing
    them would create the damage rather than find it.
  */
  const int count = 4;
  const int pins[4]  = { PIN_L_IN1, PIN_L_IN2, PIN_R_IN1, PIN_R_IN2 };
  const char* names[4] = { "IN1 (left)", "IN2 (left)", "IN3 (right)", "IN4 (right)" };
#endif

  Serial.println("\n=== PHASE 1: pin check ===");
  Serial.println("Probe each pin against GND as it is named — expect ~3.3V.");
#if MOTOR_DRIVE_STYLE == DRIVE_IN_PWM
  Serial.println("ENA/ENB skipped — jumpers are fitted, so they are held at +5V.");
#endif

  for (int i = 0; i < count; i++) {
    pinMode(pins[i], OUTPUT);
    digitalWrite(pins[i], LOW);
  }

  for (int i = 0; i < count; i++) {
    Serial.printf("  GPIO %2d  %-20s HIGH now\n", pins[i], names[i]);
    digitalWrite(pins[i], HIGH);
    delay(2500);
    digitalWrite(pins[i], LOW);
  }
  Serial.println("=== pin check done ===");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[boot] motor bench test");
  Serial.printf("[pins] LEFT en=%d in=%d/%d   RIGHT en=%d in=%d/%d   pwm=%dHz\n",
                PIN_L_EN, PIN_L_IN1, PIN_L_IN2,
                PIN_R_EN, PIN_R_IN1, PIN_R_IN2, PWM_FREQ);

#if RUN_PIN_CHECK
  pinCheck();
#elif MOTOR_DRIVE_STYLE == DRIVE_IN_PWM
  Serial.println("\n[skip] pin check is off — with the ENA/ENB jumpers fitted it would");
  Serial.println("       drive the motors at full DC, not just probe the pins.");
  Serial.println("       To meter them: disconnect the motor battery, power the ESP32");
  Serial.println("       from USB, and set RUN_PIN_CHECK to 1.");
#endif

  setupMotor(left);
  setupMotor(right);

  Serial.println("[note] if nothing turns at full duty, the fault is power or");
  Serial.println("       wiring — not code. Check in this order:");
  Serial.println("       1. ESP32 GND and L298N GND joined");
  Serial.println("       2. battery on the L298N +12V terminal, not the ESP32");
#if MOTOR_DRIVE_STYLE == DRIVE_IN_PWM
  Serial.println("       3. ENA/ENB jumpers FITTED and nothing wired to them");
#else
  Serial.println("       3. ENA/ENB jumpers REMOVED and wired to GPIO 25/33");
#endif
  Serial.println("       4. motor wires in the OUT1/OUT2 and OUT3/OUT4 screw terminals");
  Serial.println("       5. battery can actually source ~1A — a 9V block cannot");
}

/**
 * Walk one motor up the duty range, announcing each step before it runs.
 *
 * Ramped rather than slammed to full, because a supply that cannot take the
 * inrush resets the board — and a reset at full duty tells you nothing except
 * that something went wrong. Stepping up means the last line printed before the
 * board dies *is* the answer: it names the duty the supply gave out at.
 *
 * Flushed before each step so the line has actually left the UART when the
 * brownout hits. Without that the most useful line is the one still sitting in
 * the buffer when power drops.
 */
void ramp(const Motor& m, bool forward) {
  Serial.printf("\n>> %s %s — ramping\n", m.name, forward ? "FORWARD" : "REVERSE");
  // Flushed like the steps below it. Unflushed, this header sits in the buffer
  // and is lost when the board resets on the very first duty — which hides
  // *which motor* was being energised at the time.
  Serial.flush();

  for (int pct = 25; pct <= 100; pct += 25) {
    const int duty = PWM_MAX * pct / 100;
    Serial.printf("   %3d%%  duty %3d/%d\n", pct, duty, PWM_MAX);
    Serial.flush();
    run(m, forward, duty);
    delay(1200);
  }

  halt(m);
  Serial.printf("   %s stopped\n", m.name);
  delay(600);
}

void loop() {
  Serial.println("\n================ pass ================");
  Serial.println("If the board resets mid-ramp, the last duty printed is where");
  Serial.println("the supply gave out — that is a power fault, not a code one.");

#if TEST_MOTORS != TEST_RIGHT
  ramp(left,  true);
  ramp(left,  false);
  step(left,  true, PWM_MAX / 2, "should be noticeably slower than 100%");
#endif

#if TEST_MOTORS != TEST_LEFT
  ramp(right, true);
  ramp(right, false);
  // Half power proves the speed input is really doing something. If this is
  // indistinguishable from the 100% step, PWM is not reaching the driver.
  step(right, true, PWM_MAX / 2, "should be noticeably slower than 100%");
#endif

#if TEST_MOTORS == TEST_BOTH
  // Both together, as the rover actually drives — and the heaviest load in the
  // whole routine, so it comes last.
  Serial.println("\n>> BOTH FORWARD — the rover should drive straight");
  Serial.flush();
  run(left, true, PWM_MAX);
  run(right, true, PWM_MAX);
  delay(2000);
  halt(left);
  halt(right);
#endif

  Serial.println("\n[pass complete] repeating in 3s");
  delay(3000);
}

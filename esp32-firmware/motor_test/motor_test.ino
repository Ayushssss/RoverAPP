/*
  AgriVerse Rover — motor bench test

  No WiFi, no WebSocket, no phone. Flash this and the motors run through a
  fixed routine on their own, so a wiring or power fault can be found without
  anything else being able to be at fault.

  Pins are identical to rover_controller.ino — if the rover works here and not
  there, the problem is upstream of the motors.

  ── Wiring ────────────────────────────────────────────────────
    ENA -> 25   IN1 -> 26   IN2 -> 27      (left)
    ENB -> 33   IN3 -> 32   IN4 -> 14      (right)

    Battery + -> L298N +12V        Battery - -> L298N GND
    L298N 5V  -> ESP32 VIN         L298N GND -> ESP32 GND   ← must share
    (the 5V pin is only live with the 5V-enable jumper fitted, and only when
     the motor supply is 12V or less)

    REMOVE THE ENA/ENB JUMPERS, or speed control does nothing.

  Serial monitor at 115200 — every step is announced before it runs.
*/

#define PIN_L_EN   25
#define PIN_L_IN1  26
#define PIN_L_IN2  27
#define PIN_R_EN   33
#define PIN_R_IN1  32
#define PIN_R_IN2  14

const int PWM_FREQ = 5000;
const int PWM_BITS = 8;
const int PWM_MAX  = (1 << PWM_BITS) - 1;

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

struct Motor { const char* name; int en, in1, in2, ch; };
Motor left  = { "LEFT",  PIN_L_EN, PIN_L_IN1, PIN_L_IN2, 0 };
Motor right = { "RIGHT", PIN_R_EN, PIN_R_IN1, PIN_R_IN2, 1 };

void setupMotor(const Motor& m) {
  pinMode(m.in1, OUTPUT);
  pinMode(m.in2, OUTPUT);
  digitalWrite(m.in1, LOW);
  digitalWrite(m.in2, LOW);
  pwmSetup(m.en, m.ch);
  pwmWrite(m.en, m.ch, 0);
}

void run(const Motor& m, bool forward, int duty) {
  digitalWrite(m.in1, forward ? HIGH : LOW);
  digitalWrite(m.in2, forward ? LOW : HIGH);
  pwmWrite(m.en, m.ch, duty);
}

void halt(const Motor& m) {
  digitalWrite(m.in1, LOW);
  digitalWrite(m.in2, LOW);
  pwmWrite(m.en, m.ch, 0);
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
  const int pins[6]  = { PIN_L_EN, PIN_L_IN1, PIN_L_IN2, PIN_R_EN, PIN_R_IN1, PIN_R_IN2 };
  const char* names[6] = { "ENA (left enable)", "IN1 (left)", "IN2 (left)",
                           "ENB (right enable)", "IN3 (right)", "IN4 (right)" };

  Serial.println("\n=== PHASE 1: pin check ===");
  Serial.println("Probe each pin against GND as it is named — expect ~3.3V.");

  for (int i = 0; i < 6; i++) {
    pinMode(pins[i], OUTPUT);
    digitalWrite(pins[i], LOW);
  }

  for (int i = 0; i < 6; i++) {
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

  pinCheck();

  setupMotor(left);
  setupMotor(right);

  Serial.println("[note] if nothing turns at full duty, the fault is power or");
  Serial.println("       wiring — not code. Check in this order:");
  Serial.println("       1. ESP32 GND and L298N GND joined");
  Serial.println("       2. battery on the L298N +12V terminal, not the ESP32");
  Serial.println("       3. ENA/ENB jumpers removed");
  Serial.println("       4. motor wires in the OUT1/OUT2 and OUT3/OUT4 screw terminals");
}

void loop() {
  Serial.println("\n================ pass ================");

  // Full power first: if anything is going to move, it moves here.
  step(left,  true,  PWM_MAX, "should turn, full speed");
  step(left,  false, PWM_MAX, "should turn the other way");
  step(right, true,  PWM_MAX, "should turn, full speed");
  step(right, false, PWM_MAX, "should turn the other way");

  // Then half power, to prove the enable pin is really under PWM control.
  // If these are as fast as the full-power steps, the ENA/ENB jumpers are
  // still fitted and the driver is ignoring the speed input.
  step(left,  true, PWM_MAX / 2, "should be noticeably slower");
  step(right, true, PWM_MAX / 2, "should be noticeably slower");

  // Both together, as the rover actually drives.
  Serial.println("\n>> BOTH FORWARD — the rover should drive straight");
  run(left, true, PWM_MAX);
  run(right, true, PWM_MAX);
  delay(2000);
  halt(left);
  halt(right);

  Serial.println("\n[pass complete] repeating in 3s");
  delay(3000);
}

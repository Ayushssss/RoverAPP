/*
  HC-SR04 bench test — no WiFi, no motors, no relay.

  Flash this before night_rover.ino. It isolates the range finder from
  everything else, so a bad reading means a bad sensor or bad wiring and
  nothing more. Diagnosing an ultrasonic fault with motors, WiFi and a
  WebSocket in the same sketch is how an afternoon disappears.

  Serial monitor at 115200.

  ── Wiring ────────────────────────────────────────────────────
      VCC  -> 5V        (unreliable at 3.3V — the transmit burst is too weak)
      GND  -> GND
      TRIG -> GPIO 18   (S3: 17)
      ECHO -> GPIO 34   (S3: 18)  ⚠ THROUGH A DIVIDER

  ⚠ ECHO IDLES AT 5V AND THE ESP32 IS A 3.3V PART. Wired straight to a pin it
  exceeds the absolute maximum rating. It often appears to work, because the
  protection diodes conduct and clamp it — while being slowly destroyed. The
  failure arrives weeks later as a pin that reads randomly.

        ECHO ──┬── 1k ──┬────────> GPIO 34
               │        │
               │       2k
               │        │
               └────────┴──────── GND

  5V x 2k/(1k+2k) = 3.3V. Any 1:2 ratio works; 10k/20k draws less.

  ── What to expect ────────────────────────────────────────────
  Point it at a wall 30-50cm away and hold still. A working sensor reads
  within about 3mm of the tape measure and varies by under a centimetre
  between samples. Then sweep your hand in and out — the number should track
  it smoothly, without sticking or jumping.

  Anything else, read the diagnosis this sketch prints. It names the fault
  rather than leaving you to infer it from a number.
*/

#if defined(CONFIG_IDF_TARGET_ESP32S3)
  #define PIN_TRIG 17
  #define PIN_ECHO 18
#else
  #define PIN_TRIG 18
  // Input-only on the classic ESP32, which is deliberate: nothing can
  // configure it as an output and drive it back into the divider.
  #define PIN_ECHO 34
#endif

/** The HC-SR04's rated ceiling. Beyond this it simply stops answering. */
const float MAX_CM = 400.0f;
/** Round trip for 4m of air. Waiting longer than this only wastes time. */
const unsigned long ECHO_TIMEOUT_US = 25000;
/** The datasheet minimum between pings, or the previous echo is still out. */
const unsigned long PING_INTERVAL_MS = 60;

const int WINDOW = 20;
float samples[WINDOW];
int sampleCount = 0;
int sampleAt = 0;

unsigned long pings = 0;
unsigned long silent = 0;
unsigned long lastPing = 0;
unsigned long lastReport = 0;

/*
  pulseIn here, interrupts in the real firmware.

  Blocking for up to 25ms is fine in a sketch whose only job is to measure.
  night_rover.ino cannot afford it — that delay would sit on top of ws.loop()
  and the failsafe, and the rover would ignore a stop command for as long as
  it was listening for an echo. Different jobs, different trade.
*/
unsigned long measureEchoUs() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  return pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);   // 0 on timeout
}

/** Sound covers 1cm out and back in ~58us at room temperature. */
float usToCm(unsigned long us) {
  return us / 58.0f;
}

void addSample(float cm) {
  samples[sampleAt] = cm;
  sampleAt = (sampleAt + 1) % WINDOW;
  if (sampleCount < WINDOW) sampleCount++;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n\n=== HC-SR04 bench test ===");
  Serial.printf("TRIG  GPIO %d\n", PIN_TRIG);
  Serial.printf("ECHO  GPIO %d\n", PIN_ECHO);
  Serial.println();

  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);

  /*
    Idle state first, before any ping.

    ECHO should rest LOW and only pulse high in response to a trigger. Finding
    it already high tells you the fault without a single measurement, and it is
    the one check that distinguishes "miswired" from "sensor sees nothing" —
    which produce identical readings of zero.
  */
  delay(100);
  const int idle = digitalRead(PIN_ECHO);
  Serial.printf("ECHO idle state: %s\n", idle ? "HIGH  <-- WRONG" : "LOW (correct)");
  if (idle) {
    Serial.println();
    Serial.println("  ECHO is high before anything was sent. Almost always one of:");
    Serial.println("    - TRIG and ECHO swapped");
    Serial.println("    - ECHO wired to the wrong pin");
    Serial.println("    - the divider is wired as a pull-up to 5V rather than");
    Serial.println("      a divider to GND");
    Serial.println("  Fix this before reading anything below — it will be nonsense.");
  }
  Serial.println();
  Serial.println("Point it at a wall 30-50cm away. Reading every 500ms.");
  Serial.println("--------------------------------------------------------");
}

void loop() {
  const unsigned long now = millis();

  if (now - lastPing >= PING_INTERVAL_MS) {
    lastPing = now;
    pings++;
    const unsigned long us = measureEchoUs();
    if (us == 0) {
      silent++;
    } else {
      const float cm = usToCm(us);
      if (cm > 0 && cm <= MAX_CM) addSample(cm);
    }
  }

  if (now - lastReport < 500) return;
  lastReport = now;

  // ── No echo at all ──
  if (sampleCount == 0) {
    Serial.printf("no echo  (%lu pings, %lu silent)\n", pings, silent);
    if (pings > 30 && pings == silent) {
      Serial.println();
      Serial.println("  Nothing has come back at all. In order of likelihood:");
      Serial.println("    1. VCC is on 3V3. It needs 5V — at 3.3V the burst is");
      Serial.println("       too weak to return, and the module still powers up,");
      Serial.println("       so it looks alive and reads nothing.");
      Serial.println("    2. GND not shared with the ESP32.");
      Serial.println("    3. TRIG on the wrong pin — nothing is being sent.");
      Serial.println("    4. Pointed at open space, or at a surface angled away.");
      Serial.println("       Sound at 45 degrees reflects away, not back. Aim it");
      Serial.println("       square at a wall before believing the sensor is dead.");
      Serial.println("    5. Soft furnishings absorb the burst. Try a hard wall.");
      Serial.println();
      pings = silent = 0;   // so the advice does not repeat every half second
    }
    return;
  }

  // ── Statistics over the window ──
  float lo = samples[0], hi = samples[0], sum = 0;
  for (int i = 0; i < sampleCount; i++) {
    lo = min(lo, samples[i]);
    hi = max(hi, samples[i]);
    sum += samples[i];
  }
  const float avg = sum / sampleCount;
  const float spread = hi - lo;
  const float lossPct = pings ? (100.0f * silent / pings) : 0;

  Serial.printf("%6.1f cm   avg %6.1f   spread %5.1f   loss %3.0f%%   %s\n",
                samples[(sampleAt - 1 + WINDOW) % WINDOW], avg, spread, lossPct,
                spread < 1.0f  ? "steady"
                : spread < 5.0f ? "ok"
                : "NOISY");

  /*
    A wide spread while nothing is moving is the interesting failure, because
    the number still looks plausible — it is only wrong. Worth naming, since
    the usual cause is electrical rather than acoustic.
  */
  if (spread > 5.0f && sampleCount == WINDOW) {
    Serial.println("  ^ readings jumping while still. Usually:");
    Serial.println("    - the 5V rail sagging when motors run (test with them off)");
    Serial.println("    - long unshielded wires next to the motor leads");
    Serial.println("    - an echo off a second surface arriving late; try aiming");
    Serial.println("      somewhere less cluttered");
  }
}

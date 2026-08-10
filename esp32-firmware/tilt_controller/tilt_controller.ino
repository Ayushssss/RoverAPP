/*
  AgriVerse Rover — handheld tilt controller (MPU6050)

  A third ESP32 you hold in your hand. Tilt it forward and the rover drives
  forward; tilt left and it turns left. It reaches the rover the same way the
  phone does — through the relay — so the drive board cannot tell the
  difference and needs no code for it.

  ── Safety: the arming threshold ──────────────────────────────
  There is no button, so the tilt itself has to say whether you mean it. Below
  ARM_TILT_DEG nothing is sent and the rover is told to stop; past it, you are
  steering. A controller resting on a roughly level surface therefore sits
  quiet rather than driving away.

  This is weaker than a held button — a controller left on a slope steeper
  than the threshold WILL drive the rover. Keep it flat when not in use.

  ── Libraries ─────────────────────────────────────────────────
    • WebSockets        by Markus Sattler
    • ArduinoJson       by Benoit Blanchon
  The MPU6050 is read directly over I2C. Adafruit's library refuses any module
  whose WHO_AM_I is not exactly 0x68, which rejects most clones outright.

  ── Wiring ────────────────────────────────────────────────────
    MPU6050  VCC -> 3V3      GND -> GND
             SDA -> GPIO 21  SCL -> GPIO 22
             (AD0 unconnected or to GND — that selects address 0x68)

  ── Pairing ───────────────────────────────────────────────────
  Set ROVER_MAC to the drive board's MAC, the one registered in the app.
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>

// ── WiFi ──
const char* WIFI_SSID = "ANANYA";
const char* WIFI_PASS = "satish.m";

// ── Server ──
const char* WS_HOST = "roverapp.duckdns.org";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

// ⚠ The rover this controller drives.
const char* ROVER_MAC = "8C:94:DF:72:0D:90";

// ── Pins ──
#define I2C_SDA    21
#define I2C_SCL    22

// ── MPU6050 ──
uint8_t MPU_ADDR = 0x68;

const uint8_t REG_SMPLRT_DIV   = 0x19;
const uint8_t REG_CONFIG       = 0x1A;
const uint8_t REG_ACCEL_CONFIG = 0x1C;
const uint8_t REG_ACCEL_X      = 0x3B;
const uint8_t REG_PWR_MGMT1    = 0x6B;
const uint8_t REG_WHO_AM_I     = 0x75;

/**
 * Tilt beyond this many degrees counts as full deflection. 30 is a natural
 * wrist range — small enough to reach comfortably, large enough that ordinary
 * hand tremor doesn't reach the extremes.
 */
const float FULL_TILT_DEG = 30.0f;
/** Below this, treat as centred. A hand is never perfectly still. */
const float TILT_DEADZONE_DEG = 4.0f;
/**
 * Deliberate-intent threshold. Tilt less than this on both axes and nothing
 * is sent at all — this is what stops a controller lying on a table from
 * driving the rover. Comfortably above the deadzone so there is a clear band
 * between "holding it level" and "steering".
 */
const float ARM_TILT_DEG = 12.0f;
/** 20Hz — matches what the phone sends, comfortably inside the 1s failsafe. */
const unsigned long SEND_INTERVAL_MS = 50;

WebSocketsClient ws;
bool linked = false;
bool mpuReady = false;

/** Readings at rest, captured at boot so "level" is however you hold it. */
float restPitch = 0, restRoll = 0;
/** Smoothed output — raw accelerometer data is far too jittery to steer with. */
float smoothX = 0, smoothY = 0;

unsigned long lastSend = 0;
unsigned long lastBeat = 0;
bool wasArmed = false;

/** Last acceleration in g, kept for the diagnostic heartbeat. */
float lastAx = 0, lastAy = 0, lastAz = 0;

bool mpuWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission(true) == 0;
}

/** Reads accel X/Y/Z as raw counts. Returns false if the sensor didn't answer. */
bool mpuReadAccel(int16_t& ax, int16_t& ay, int16_t& az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(REG_ACCEL_X);
  if (Wire.endTransmission(true) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 6, (int)true) != 6) return false;

  /*
    Each byte is read into its own variable before being combined.

    Writing `(Wire.read() << 8) | Wire.read()` looks natural and is wrong: C++
    does not define which side of `|` runs first, so the compiler is free to
    take the low byte before the high one. That silently swaps every pair and
    produces values that look like plausible noise but never track movement.
  */
  const uint8_t xh = Wire.read(), xl = Wire.read();
  const uint8_t yh = Wire.read(), yl = Wire.read();
  const uint8_t zh = Wire.read(), zl = Wire.read();

  ax = (int16_t)((xh << 8) | xl);
  ay = (int16_t)((yh << 8) | yl);
  az = (int16_t)((zh << 8) | zl);
  return true;
}

/**
 * Tilt from gravity alone — no gyro, no filter.
 *
 * Steering is a slow, deliberate movement, and the accelerometer alone is
 * perfectly good at telling which way down is. A gyro would only matter for
 * fast rotation, which is not how anyone holds a controller.
 */
bool readTilt(float& pitchDeg, float& rollDeg) {
  if (!mpuReady) return false;

  int16_t rx, ry, rz;
  if (!mpuReadAccel(rx, ry, rz)) return false;

  // Counts to g at the +/-2g range: 16384 counts per g. The units cancel in
  // atan2 so the angle is unaffected, but g reads far more clearly in the log
  // than raw counts do.
  const float x = rx / 16384.0f;
  const float y = ry / 16384.0f;
  const float z = rz / 16384.0f;
  lastAx = x; lastAy = y; lastAz = z;

  pitchDeg = atan2f(-x, sqrtf(y * y + z * z)) * 180.0f / PI;
  rollDeg  = atan2f(y, sqrtf(x * x + z * z)) * 180.0f / PI;
  return true;
}

/** Tilt in degrees to a -1..1 axis, with the deadzone removed smoothly. */
float axisFromTilt(float deg) {
  const float magnitude = fabsf(deg);
  if (magnitude < TILT_DEADZONE_DEG) return 0.0f;

  // Rescaled from the deadzone edge rather than from zero, so the output
  // starts at 0 as you leave the deadzone instead of jumping.
  const float span = FULL_TILT_DEG - TILT_DEADZONE_DEG;
  float v = (magnitude - TILT_DEADZONE_DEG) / span;
  if (v > 1.0f) v = 1.0f;
  return deg < 0 ? -v : v;
}

void sendRegistration() {
  StaticJsonDocument<256> doc;
  doc["type"] = "register";
  doc["role"] = "controller";
  doc["macAddress"] = WiFi.macAddress();
  doc["ip"] = WiFi.localIP().toString();
  doc["roverMac"] = ROVER_MAC;

  String msg;
  serializeJson(doc, msg);
  ws.sendTXT(msg);
  Serial.printf("[ws] registered as controller for %s (self %s)\n",
                ROVER_MAC, WiFi.macAddress().c_str());
}

void sendInput(float x, float y) {
  if (!linked) return;
  StaticJsonDocument<128> doc;
  doc["type"] = "input";
  doc["x"] = x;
  doc["y"] = y;
  String msg;
  serializeJson(doc, msg);
  ws.sendTXT(msg);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[ws] disconnected — retrying");
      linked = false;
      break;

    case WStype_CONNECTED:
      Serial.println("[ws] connected");
      linked = true;
      sendRegistration();
      break;

    case WStype_TEXT: {
      StaticJsonDocument<256> doc;
      if (deserializeJson(doc, payload, length)) return;
      const char* msgType = doc["type"];
      if (msgType && strcmp(msgType, "registered") == 0) {
        Serial.println("[ws] server confirmed registration");
      }
      // Everything else is for the other boards; the relay fans out to all of
      // them and this one simply has nothing to do with drive or display.
      break;
    }

    default:
      break;
  }
}

bool setupMpu() {
  // 100kHz. The scanner found this module reliably at that speed, and clone
  // boards on jumper leads without their own pull-ups get marginal above it.
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  // AD0 selects between 0x68 and 0x69, and breakout boards differ on how it
  // is tied, so look for both rather than assuming.
  bool found = false;
  for (uint8_t addr : { (uint8_t)0x68, (uint8_t)0x69 }) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      MPU_ADDR = addr;
      found = true;
      Serial.printf("[mpu] device at 0x%02X\n", addr);
      break;
    }
  }
  if (!found) {
    Serial.println("[mpu] nothing at 0x68 or 0x69.");
    Serial.printf("[mpu] check SDA->GPIO %d, SCL->GPIO %d, VCC->3V3, GND->GND\n",
                  I2C_SDA, I2C_SCL);
    return false;
  }

  /*
    WHO_AM_I is reported, not enforced.

    Adafruit's library refuses to start unless this reads exactly 0x68, which
    is why it rejected this module. Clones legitimately report 0x70, 0x71,
    0x72, 0x98 and others while implementing the same register map, so the
    value is worth logging and worth ignoring.
  */
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(REG_WHO_AM_I);
  Wire.endTransmission(true);
  if (Wire.requestFrom((int)MPU_ADDR, 1, (int)true) == 1) {
    const uint8_t who = Wire.read();
    /*
      0x68 is genuine; 0x70/0x71/0x72/0x98 are clones that share the register
      map and work fine. 0x00 and 0xFF are neither — they are what an
      unpowered or dead chip leaves on the bus while its address decoder still
      ACKs, and calling that "a clone" sends you looking for a software fix
      that does not exist.
    */
    const bool plausible = (who == 0x68 || who == 0x70 || who == 0x71 ||
                            who == 0x72 || who == 0x73 || who == 0x98);
    Serial.printf("[mpu] WHO_AM_I = 0x%02X%s\n", who,
                  who == 0x68 ? " (genuine MPU6050)"
                  : plausible ? " (clone — register map matches)"
                  : " <- INVALID. No MPU reports this.");
    if (!plausible) {
      Serial.println("[mpu] the chip is ACKing its address but not running.");
      Serial.println("[mpu] try powering VCC from 5V/VIN rather than 3V3;");
      Serial.println("[mpu] if that changes nothing, the module is faulty.");
    }
  }

  // Reset, then wake with the X-gyro PLL as clock source. Writing 0 to
  // PWR_MGMT_1 alone is enough on a genuine part but does not always take on
  // a clone.
  mpuWrite(REG_PWR_MGMT1, 0x80);
  delay(120);
  if (!mpuWrite(REG_PWR_MGMT1, 0x01)) {
    Serial.println("[mpu] could not wake the device");
    return false;
  }
  delay(60);

  mpuWrite(REG_SMPLRT_DIV, 0x07);     // 125Hz sample rate
  mpuWrite(REG_CONFIG, 0x03);         // 44Hz DLPF — steadies the tilt reading
  mpuWrite(REG_ACCEL_CONFIG, 0x00);   // +/-2g, most sensitive range
  delay(50);

  /*
    Prove it is producing data before reporting ready.

    A sensor sitting still still measures gravity — about 1.0g total, however
    it is oriented. A magnitude near zero means it is answering on the bus but
    not sampling.
  */
  int16_t rx, ry, rz;
  if (!mpuReadAccel(rx, ry, rz)) {
    Serial.println("[mpu] address responds but reads fail");
    return false;
  }
  const float magnitude =
    sqrtf((float)rx * rx + (float)ry * ry + (float)rz * rz) / 16384.0f;
  Serial.printf("[mpu] first sample: %d %d %d (magnitude %.2fg)\n", rx, ry, rz, magnitude);

  if (magnitude < 0.5f) {
    Serial.println("[mpu] magnitude far below gravity — the sensor is not sampling.");
    return false;
  }

  Serial.println("[mpu] ready");
  return true;
}

/** Whatever angle it is sitting at now becomes "centre". */
void calibrate() {
  Serial.print("[mpu] hold still, levelling");
  float pitchSum = 0, rollSum = 0;
  int samples = 0;
  for (int i = 0; i < 40; i++) {
    float p, r;
    if (readTilt(p, r)) { pitchSum += p; rollSum += r; samples++; }
    delay(25);
    if (i % 10 == 0) Serial.print(".");
  }
  if (samples > 0) {
    restPitch = pitchSum / samples;
    restRoll  = rollSum / samples;
    Serial.printf(" done (pitch %.1f, roll %.1f)\n", restPitch, restRoll);
  } else {
    Serial.println(" FAILED — no readings");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] AgriVerse tilt controller");

  mpuReady = setupMpu();
  if (mpuReady) calibrate();

  Serial.printf("[wifi] connecting to \"%s\"", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  WiFi.setSleep(false);
  Serial.printf("\n[wifi] connected — IP %s, MAC %s\n",
                WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str());

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[ntp] syncing");
  time_t now = 0;
  const unsigned long ntpStarted = millis();
  while (now < 100000 && millis() - ntpStarted < 20000) {
    time(&now);
    delay(500);
    Serial.print(".");
  }
  Serial.println(now < 100000 ? " TIMED OUT (continuing)" : " done");

  Serial.printf("[ws] connecting to wss://%s%s\n", WS_HOST, WS_PATH);
  // beginSSL: certificate validation needs a clock, and the clock needs the
  // network. Encrypted but unauthenticated — same trade as the other sketches.
  ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);
  ws.enableHeartbeat(15000, 3000, 2);

  Serial.printf("[ctl] tilt past %.0f degrees to drive; level off to stop\n", ARM_TILT_DEG);
}

void loop() {
  ws.loop();
  const unsigned long now = millis();

  if (mpuReady && now - lastSend >= SEND_INTERVAL_MS) {
    lastSend = now;

    float pitch, roll;
    if (!readTilt(pitch, roll)) return;

    const float dPitch = pitch - restPitch;
    const float dRoll  = roll - restRoll;

    // Armed only past a deliberate tilt. Held roughly level — on a table, in
    // a hand at rest — this stays false and the rover is left stopped.
    const bool armed = fabsf(dPitch) > ARM_TILT_DEG || fabsf(dRoll) > ARM_TILT_DEG;

    if (!armed) {
      // One explicit zero on disarm rather than simply going quiet. Silence
      // would work — the rover's failsafe catches it after a second — but a
      // second of coasting after levelling off is not what "stop" should mean.
      if (wasArmed) {
        smoothX = smoothY = 0;
        sendInput(0, 0);
        Serial.println("[ctl] level — stop");
      }
      wasArmed = false;
      return;
    }

    if (!wasArmed) Serial.println("[ctl] tilted — driving");
    wasArmed = true;

    const float targetY = axisFromTilt(dPitch);   // forward / back
    const float targetX = axisFromTilt(dRoll);    // turn

    /*
      Low-pass filter. Raw accelerometer output jitters by a couple of degrees
      even held still, and feeding that straight to the motors makes the rover
      twitch. 0.25 lands between responsive and steady; lower is smoother but
      starts to feel laggy.
    */
    const float alpha = 0.25f;
    smoothX += alpha * (targetX - smoothX);
    smoothY += alpha * (targetY - smoothY);

    sendInput(smoothX, smoothY);
  }

  if (now - lastBeat >= 2000) {
    lastBeat = now;

    /*
      Raw counts and live angles, not just the smoothed output.

      The output is zero whenever the tilt is below the arming threshold, so
      on its own it cannot tell "not tilted enough" from "sensor returning
      nothing at all". The accelerometer counts settle that instantly: a live
      sensor reads roughly +/-16384 on whichever axis is facing down, and a
      dead one reads 0,0,0 forever.
    */
    float pitch = 0, roll = 0;
    const bool got = readTilt(pitch, roll);
    const float dPitch = pitch - restPitch;
    const float dRoll  = roll - restRoll;

    Serial.printf(
      "[beat] %s | relay %s | accel %+6.2f %+6.2f %+6.2f %s| tilt p=%+6.1f r=%+6.1f (arm at %.0f) | out x=%.2f y=%.2f%s\n",
      WiFi.isConnected() ? "wifi OK" : "WIFI DOWN",
      linked ? "linked" : "down",
      lastAx, lastAy, lastAz,
      got ? "" : "(READ FAILED) ",
      dPitch, dRoll, ARM_TILT_DEG,
      smoothX, smoothY,
      wasArmed ? " ARMED" : "");
  }
}

/*
  AgriVerse Rover — sensor hub

  A second ESP32 that carries the sensors and the display, linked to the rover
  through the backend rather than to the drive board directly. It has its own
  MAC and its own WiFi connection, and names the rover it belongs to when it
  registers, so the app shows one rover made of several boards.

  Nothing here talks to the drive board. Either can reboot without the other
  noticing, and neither needs to know the other's address.

  ── Libraries (Library Manager) ───────────────────────────────
    • WebSockets            by Markus Sattler
    • ArduinoJson           by Benoit Blanchon
    • DHT sensor library    by Adafruit
    • Adafruit Unified Sensor   (pulled in by the DHT library)
    • LiquidCrystal I2C     by Frank de Brabander

  ── Wiring ────────────────────────────────────────────────────
    DHT11        VCC -> 3V3,  GND -> GND,  DATA -> GPIO 15
                 (a 10k resistor from DATA to 3V3 if your module has no
                  pull-up on board — most breakout boards do)

    16x2 LCD     VCC -> 5V (VIN),  GND -> GND
    (I2C, 4-pin) SDA -> GPIO 21,   SCL -> GPIO 22

    The display needs 5V to be readable, but its SDA/SCL idle at 3.3V when
    driven from the ESP32, which every PCF8574 backpack tolerates. If the
    backlight is on and the text is blank, that is the contrast pot on the
    back, not wiring.

  ── Pairing ───────────────────────────────────────────────────
  Set ROVER_MAC to the MAC of the drive board — the one registered in the app.
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>

// ── WiFi ──
const char* WIFI_SSID = "ANANYA";
const char* WIFI_PASS = "satish.m";

// ── Server ──
const char* WS_HOST = "roverapp.onrender.com";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

// ⚠ The rover this hub belongs to. Copy it from the app's rover list.
const char* ROVER_MAC = "8C:94:DF:72:0D:90";

// ── Sensors ──
#define DHT_PIN   15
#define DHT_TYPE  DHT11     // change to DHT22 if you upgrade the sensor
DHT dht(DHT_PIN, DHT_TYPE);

/**
 * The DHT11 samples about once a second and is specified for one reading every
 * two. Asking faster returns the same cached values and eventually NaN.
 */
const unsigned long SENSOR_INTERVAL_MS = 3000;

// ── Display ──
// 0x27 covers most PCF8574 backpacks; a few are 0x3F. If the screen stays
// blank, run an I2C scanner and set whichever address it finds.
#define LCD_ADDR 0x27
#define LCD_SDA  21
#define LCD_SCL  22
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

WebSocketsClient ws;
bool linked = false;

unsigned long lastSensor = 0;
unsigned long lastBeat = 0;
/** Set when the app pushes text, so readings stop overwriting it. */
unsigned long overrideUntil = 0;
const unsigned long OVERRIDE_MS = 8000;

float lastTemp = NAN;
float lastHum  = NAN;
/** Reads that came back NaN in a row. A DHT11 misses one occasionally. */
int dhtFailures = 0;
bool dhtHintShown = false;
/**
 * Failures below this are still plausibly the sensor settling after power-up;
 * past it, something is wrong and saying "warming" would be a lie.
 */
const int DHT_GRACE = 3;

void showLines(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

/** The hub's own idea of what to display, when the app isn't overriding it. */
void showStatus() {
  if (millis() < overrideUntil) return;

  char l1[17];
  char l2[17];

  if (isnan(lastTemp) || isnan(lastHum)) {
    // Distinguishing these two matters: one resolves itself in seconds, the
    // other never will and needs you to go and look at the wiring.
    if (dhtFailures > DHT_GRACE) {
      snprintf(l1, sizeof(l1), "DHT no reply");
      snprintf(l2, sizeof(l2), "Check pin %d", DHT_PIN);
    } else {
      snprintf(l1, sizeof(l1), "Sensor warming");
      snprintf(l2, sizeof(l2), "%s", linked ? "Link OK" : "Link down");
    }
  } else {
    // %.0f on the humidity: the DHT11 has 1% resolution and one decimal
    // would imply a precision it does not have.
    snprintf(l1, sizeof(l1), "T %.1fC  H %.0f%%", lastTemp, lastHum);
    snprintf(l2, sizeof(l2), "%s", linked ? "Rover linked" : "Reconnecting");
  }
  showLines(l1, l2);
}

void sendRegistration() {
  StaticJsonDocument<256> doc;
  doc["type"] = "register";
  doc["role"] = "sensor";
  doc["macAddress"] = WiFi.macAddress();
  doc["ip"] = WiFi.localIP().toString();
  doc["roverMac"] = ROVER_MAC;

  String msg;
  serializeJson(doc, msg);
  ws.sendTXT(msg);
  Serial.printf("[ws] registered as sensor hub for %s (self %s)\n",
                ROVER_MAC, WiFi.macAddress().c_str());
}

void publishReadings() {
  const float t = dht.readTemperature();
  const float h = dht.readHumidity();

  // A failed read returns NaN. Publishing it would put a hole in the app's
  // chart and a nonsense number on the display, so it is simply skipped —
  // the previous reading stands until a good one arrives.
  if (isnan(t) || isnan(h)) {
    dhtFailures++;
    Serial.printf("[dht] read failed (%d in a row)\n", dhtFailures);

    // Printed once, not every three seconds — a checklist repeating forever
    // buries the reading it is waiting for.
    if (dhtFailures > DHT_GRACE && !dhtHintShown) {
      dhtHintShown = true;
      Serial.println("[dht] the sensor is not answering. In order of likelihood:");
      Serial.printf("      1. DATA is not on GPIO %d\n", DHT_PIN);
      Serial.println("      2. no pull-up — a bare 3-pin DHT11 needs 10k from DATA to 3V3");
      Serial.println("         (blue PCB modules have one fitted already)");
      Serial.println("      3. wrong type — DHT_TYPE is DHT11; a white AM2302 is DHT22");
      Serial.println("      4. VCC on 3V3 and GND shared with this board");
    }
    showStatus();
    return;
  }

  if (dhtFailures) Serial.printf("[dht] recovered after %d failed reads\n", dhtFailures);
  dhtFailures = 0;
  dhtHintShown = false;

  lastTemp = t;
  lastHum = h;

  StaticJsonDocument<256> doc;
  doc["type"] = "telemetry";
  JsonObject readings = doc.createNestedObject("readings");
  readings["tempC"] = t;
  readings["humidity"] = h;
  // Apparent temperature. Only meaningful warm, but harmless to send.
  readings["heatIndexC"] = dht.computeHeatIndex(t, h, false);

  String msg;
  serializeJson(doc, msg);
  if (linked) ws.sendTXT(msg);

  Serial.printf("[dht] %.1fC  %.0f%%\n", t, h);
  showStatus();
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[ws] disconnected — retrying");
      linked = false;
      showStatus();
      break;

    case WStype_CONNECTED:
      Serial.println("[ws] connected");
      linked = true;
      sendRegistration();
      showStatus();
      break;

    case WStype_TEXT: {
      StaticJsonDocument<384> doc;
      if (deserializeJson(doc, payload, length)) return;

      const char* msgType = doc["type"];
      if (!msgType) return;

      if (strcmp(msgType, "display") == 0) {
        const char* l1 = doc["line1"] | "";
        const char* l2 = doc["line2"] | "";
        Serial.printf("[disp] \"%s\" / \"%s\"\n", l1, l2);
        showLines(l1, l2);
        // Hold the app's text on screen briefly, then fall back to readings.
        overrideUntil = millis() + OVERRIDE_MS;
      }
      else if (strcmp(msgType, "registered") == 0) {
        Serial.println("[ws] server confirmed registration");
      }
      else if (strcmp(msgType, "command") == 0) {
        // Commands are fanned out to every board on the rover, so this hub
        // sees the drive ones too. Ignoring them quietly is correct; logging
        // them makes the fan-out visible while wiring things up.
        const char* cmd = doc["command"];
        if (cmd) Serial.printf("[cmd] \"%s\" (not for this board)\n", cmd);
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
  Serial.println("\n[boot] AgriVerse sensor hub");

  Wire.begin(LCD_SDA, LCD_SCL);
  lcd.init();
  lcd.backlight();
  showLines("AgriVerse Rover", "Starting...");

  dht.begin();

  Serial.printf("[wifi] connecting to \"%s\"", WIFI_SSID);
  showLines("Connecting WiFi", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] connected — IP %s, MAC %s\n",
                WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str());
  showLines("WiFi OK", WiFi.localIP().toString().c_str());

  // TLS needs a correct clock before the certificate can be validated.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[ntp] syncing");
  time_t now = 0;
  while (now < 100000) {
    time(&now);
    delay(500);
    Serial.print(".");
  }
  Serial.println(" done");

  Serial.printf("[ws] connecting to wss://%s%s\n", WS_HOST, WS_PATH);
  ws.beginSslWithBundle(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);
}

void loop() {
  ws.loop();

  const unsigned long now = millis();

  if (now - lastSensor >= SENSOR_INTERVAL_MS) {
    lastSensor = now;
    publishReadings();
  }

  // Reclaim the screen once the app's text has had its moment.
  if (overrideUntil && now > overrideUntil) {
    overrideUntil = 0;
    showStatus();
  }

  if (now - lastBeat >= 15000) {
    lastBeat = now;
    Serial.printf("[beat] up %lus, WiFi %s, relay %s\n",
                  now / 1000,
                  WiFi.isConnected() ? "OK" : "DOWN",
                  linked ? "linked" : "down");
  }
}

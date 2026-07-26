/*
  RoverAPP ESP32 Firmware — LED blink test
  Connects to WebSocket server, responds to commands
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ── WiFi ──
const char* WIFI_SSID = "ANANYA";
const char* WIFI_PASS = "satish.m";

// ── Server ──
const char* WS_HOST = "roverapp.onrender.com";
const int WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

// ── Pins ──
#define LED_BUILTIN 2     // Built-in LED on most ESP32 dev boards

WebSocketsClient ws;
bool ledState = false;

// ── WebSocket event handler ──
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      digitalWrite(LED_BUILTIN, LOW);
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] Connected");
      {
        StaticJsonDocument<128> doc;
        doc["type"] = "register";
        doc["macAddress"] = WiFi.macAddress();
        String msg;
        serializeJson(doc, msg);
        ws.sendTXT(msg);
      }
      break;

    case WStype_TEXT: {
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) return;

      const char* type = doc["type"];
      if (!type) return;

      if (strcmp(type, "command") == 0) {
        const char* cmd = doc["command"];

        if (strcmp(cmd, "light") == 0) {
          ledState = !ledState;
          digitalWrite(LED_BUILTIN, ledState ? HIGH : LOW);
          Serial.printf("Light: %s\n", ledState ? "ON" : "OFF");
        }
        else if (strcmp(cmd, "stop") == 0) {
          // Nothing to stop — LED stays as-is
        }
      }
      break;
    }
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);   // Start with LED off

  // ── Connect WiFi ──
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi connected — MAC: %s\n", WiFi.macAddress().c_str());

  // ── Sync clock (required for SSL certificate validation) ──
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing time");
  time_t now = 0;
  while (now < 100000) {
    time(&now);
    delay(500);
    Serial.print(".");
  }
  struct tm *ti = localtime(&now);
  Serial.printf("\nTime synced: %s", asctime(ti));

  Serial.printf("Connecting to WebSocket: wss://%s%s\n", WS_HOST, WS_PATH);

  // ── Connect WebSocket ──
  ws.beginSslWithBundle(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);
}

void loop() {
  ws.loop();
}

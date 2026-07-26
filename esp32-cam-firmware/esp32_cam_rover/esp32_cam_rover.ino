/*
  ESP32-CAM Rover — MJPEG stream + WebSocket control
  - Streams video on HTTP port 81 at /stream
  - Connects to WebSocket on port 3001 for joystick/command relay
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_http_server.h"

// ── WiFi ──
const char* WIFI_SSID = "ANANYA";
const char* WIFI_PASS = "satish.m";

// ── Server ──
const char* WS_HOST = "roverapp-api.onrender.com";
const int WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";
const int HTTP_PORT = 81;

// ISRG Root X1 — Let's Encrypt root CA (valid through 2035)
const char* ROOT_CA = \
"-----BEGIN CERTIFICATE-----\n" \
"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\n" \
"-----END CERTIFICATE-----\n";

// ── Pins ──
#define FLASH_GPIO 4

// ── AI-Thinker ESP32-CAM pin config ──
#define PWDN_GPIO_NUM     -1  // CHANGED: Bypassed to fix 0x106 camera sleep lockups
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ── Globals ──
WebSocketsClient ws;
bool flashState = false;
int motorLeft = 0;
int motorRight = 0;

// ── Forward declarations ──
void setupCamera();
void setupWiFi();
void setupWebSocket();
void startCameraServer();

// ── Camera frame callback for MJPEG stream ──
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t *_jpg_buf = NULL;
  char part_buf[128];

  res = httpd_resp_set_status(req, "200 OK");
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
  httpd_resp_set_hdr(req, "Pragma", "no-cache");
  httpd_resp_set_hdr(req, "Expires", "0");
  httpd_resp_set_hdr(req, "X-Accel-Buffering", "no");
  httpd_resp_set_hdr(req, "Content-Type", "multipart/x-mixed-replace; boundary=123456789000000000000987654321");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      res = ESP_FAIL;
      break;
    }

    if (fb->format != PIXFORMAT_JPEG) {
      bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
      esp_camera_fb_return(fb);
      fb = NULL;
      if (!jpeg_converted) break;
    } else {
      _jpg_buf_len = fb->len;
      _jpg_buf = fb->buf;
    }

    int boundary_len = snprintf(part_buf, sizeof(part_buf),
      "--123456789000000000000987654321\r\n"
      "Content-Type: image/jpeg\r\n"
      "Content-Length: %zu\r\n\r\n", _jpg_buf_len);

    if (httpd_resp_send_chunk(req, part_buf, boundary_len) != ESP_OK) break;
    if (httpd_resp_send_chunk(req, (const char*)_jpg_buf, _jpg_buf_len) != ESP_OK) break;

    if (fb && fb->format == PIXFORMAT_JPEG) {
      esp_camera_fb_return(fb);
    }
    fb = NULL;
    _jpg_buf = NULL;

    if (httpd_resp_send_chunk(req, "\r\n", 2) != ESP_OK) break;
  }

  if (fb) esp_camera_fb_return(fb);
  httpd_resp_send_chunk(req, "--123456789000000000000987654321--\r\n", 40);
  return res;
}

static const httpd_uri_t stream_uri = {
  .uri       = "/stream",
  .method    = HTTP_GET,
  .handler   = stream_handler,
  .user_ctx  = NULL
};

// ── Setup Camera ──
void setupCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  
  config.xclk_freq_hz = 10000000;   // CHANGED: Lowered from 20MHz to 10MHz to clear signal distortion
  config.frame_size = FRAMESIZE_VGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 12;
  config.fb_count = 2;

  if (config.pixel_format == PIXFORMAT_JPEG || !psramFound()) {
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_DRAM; // Fallback to internal RAM if PSRAM init misses
  } else {
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_framesize(s, FRAMESIZE_VGA);
    s->set_quality(s, 12);
  }
}

// ── Setup WiFi ──
void setupWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi connected — IP: %s  MAC: %s\n", WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str());
}

// ── WebSocket Relay ──
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      digitalWrite(FLASH_GPIO, LOW);
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] Connected");
      {
        StaticJsonDocument<256> doc;
        doc["type"] = "register";
        doc["macAddress"] = WiFi.macAddress();
        String msg;
        serializeJson(doc, msg);
        ws.sendTXT(msg);
      }
      break;

    case WStype_TEXT: {
      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) return;

      const char* type = doc["type"];
      if (!type) return;

      if (strcmp(type, "command") == 0) {
        const char* cmd = doc["command"];
        if (strcmp(cmd, "light") == 0) {
          flashState = !flashState;
          digitalWrite(FLASH_GPIO, flashState ? HIGH : LOW);
          Serial.printf("Flash: %s\n", flashState ? "ON" : "OFF");
        } else if (strcmp(cmd, "stop") == 0) {
          motorLeft = 0;
          motorRight = 0;
          Serial.println("Stop");
        }
      } else if (strcmp(type, "joystick") == 0) {
        int x = doc["x"];
        int y = doc["y"];
        motorLeft = constrain(y + x, -255, 255);
        motorRight = constrain(y - x, -255, 255);
        Serial.printf("Motors: L=%d R=%d\n", motorLeft, motorRight);
      }
      break;
    }
    default:
      break;
  }
}

void setupWebSocket() {
  ws.beginSslWithCA(WS_HOST, WS_PORT, WS_PATH, ROOT_CA);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);
}

// ── HTTP Stream Server ──
void startCameraServer() {
  httpd_handle_t camera_httpd = NULL;
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = HTTP_PORT;
  config.ctrl_port = 32768;
  config.max_uri_handlers = 4;
  config.lru_purge_enable = true;

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &stream_uri);
  }
}

// ── Main Entry Points ──
void setup() {
  Serial.begin(115200);
  pinMode(FLASH_GPIO, OUTPUT);
  digitalWrite(FLASH_GPIO, LOW);

  // 1. Establish the network connection infrastructure first
  setupWiFi();
  setupWebSocket();

  // 2. Fire up the camera registers second (prevents pin 0 clock fighting)
  setupCamera();
  startCameraServer();

  Serial.printf("Camera stream: http://%s:%d/stream\n", WiFi.localIP().toString().c_str(), HTTP_PORT);
}

void loop() {
  ws.loop();
  delay(1);
}

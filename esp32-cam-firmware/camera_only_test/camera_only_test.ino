/*
  AgriVerse Rover — camera-only isolation test

  No WiFi, no NTP, no WebSocket — nothing that touches the radio or the
  network stack. If the serial monitor is still garbling near camera init
  with this flashed, WiFi and NTP are cleared as suspects entirely and the
  fault is the camera/power hardware itself, full stop.

  Also blinks the flash LED (GPIO4) so the result is readable even if the
  serial line is unusable: three quick blinks means it worked, one long
  blink repeating means it failed. That gives you a second, independent way
  to read the outcome if the monitor is still unreadable.

  Board: AI Thinker ESP32-CAM. Serial monitor at 115200.
*/

#include "esp_camera.h"

#define FLASH_GPIO 4

// ── Camera pins (AI-Thinker) — identical to the relay sketch ──
/*
  PWDN is GPIO 32 on this board and the driver must drive it LOW to wake the
  sensor. Setting it to -1 leaves the pin floating, the sensor stays in
  power-down, and it never answers on SCCB — which surfaces as an I2C probe
  timeout and ESP_ERR_NOT_SUPPORTED (0x106), not as an obvious power fault.
*/
#define PWDN_GPIO_NUM     32
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

bool cameraReady = false;

void blinkFail() {
  digitalWrite(FLASH_GPIO, HIGH);
  delay(800);
  digitalWrite(FLASH_GPIO, LOW);
  delay(800);
}

void blinkOk() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(FLASH_GPIO, HIGH);
    delay(120);
    digitalWrite(FLASH_GPIO, LOW);
    delay(120);
  }
  delay(1200);
}

void setup() {
  pinMode(FLASH_GPIO, OUTPUT);
  digitalWrite(FLASH_GPIO, LOW);

  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("=====================================");
  Serial.println("  Camera-only isolation test");
  Serial.println("  No WiFi. No NTP. No WebSocket.");
  Serial.println("=====================================");

  Serial.printf("[info] PSRAM found: %s\n", psramFound() ? "YES" : "NO — this alone will fail init above QVGA");
  Serial.printf("[info] free heap: %u bytes\n", ESP.getFreeHeap());

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
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
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;   // smallest, least demanding — rules out a size/PSRAM edge case
  config.jpeg_quality = 15;
  config.fb_count = 1;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;

  Serial.println("[cam] calling esp_camera_init()...");
  esp_err_t err = esp_camera_init(&config);

  if (err != ESP_OK) {
    Serial.printf("[cam] FAILED — esp_err_t = 0x%x\n", err);
    // Spelled out because the numeric code alone means nothing without the
    // table, and this is exactly the line that's been getting lost so far.
    switch (err) {
      case 0x105: Serial.println("[cam] 0x105 = ESP_ERR_NO_MEM — PSRAM off, wrong type, or not physically present"); break;
      case 0x106: Serial.println("[cam] 0x106 = ESP_ERR_INVALID_ARG or camera not found — check the ribbon"); break;
      case 0x20001: Serial.println("[cam] 0x20001 = sensor SCCB probe failed — ribbon backwards, unseated, or damaged"); break;
      case 0x20004: Serial.println("[cam] 0x20004 = SCCB timeout — same as above"); break;
      default: Serial.println("[cam] not in the common table — search this exact hex code, it is specific"); break;
    }
    return;
  }

  cameraReady = true;
  Serial.println("[cam] esp_camera_init() OK");

  camera_fb_t* fb = esp_camera_fb_get();
  if (fb) {
    Serial.printf("[cam] captured a real frame: %u bytes\n", (unsigned)fb->len);
    esp_camera_fb_return(fb);
    Serial.println("[cam] RESULT: WORKING");
  } else {
    Serial.println("[cam] init reported OK but capture still failed — likely a power dip during the capture itself");
    cameraReady = false;
  }
}

void loop() {
  if (cameraReady) blinkOk();
  else blinkFail();
}

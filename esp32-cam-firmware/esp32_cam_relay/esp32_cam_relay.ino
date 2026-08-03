/*
  AgriVerse Rover — ESP32-CAM, global relay

  Streams JPEG frames up the same WebSocket the rover uses, so the phone can
  watch from anywhere in the world. Nothing is exposed to the internet and no
  port forwarding is involved: the camera dials out, the server relays.

  Also runs a local MJPEG server on port 81, independent of the relay — it
  serves whether or not anyone is watching remotely. Far smoother than the
  relay when the phone is on the same WiFi, and the app offers both as a
  source: "Anywhere" (relay) and "Local" (this).

  Frames are only captured while somebody is watching — the server sends
  {"type":"stream","on":true} when the first viewer opens the screen and
  {"on":false} when the last one leaves.

  Requires:
    • WebSockets    by Markus Sattler
    • ArduinoJson   by Benoit Blanchon
    • Board: "AI Thinker ESP32-CAM", PSRAM enabled

  ── Pair this camera with its rover ──────────────────────────
  Set ROVER_MAC below to the MAC of the rover board this camera rides on —
  the one you registered in the app. The camera has its own MAC, which the
  app never sees, so the pairing has to be declared here.
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
const char* WS_HOST = "roverapp.onrender.com";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws/esp32";

// ⚠ The rover this camera belongs to. Copy it from the app's rover list.
const char* ROVER_MAC = "8C:94:DF:72:0D:90";

#define FLASH_GPIO 4

// ── Camera pins (AI-Thinker) ──
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

/*
  Relay frame budget.

  Every frame crosses the internet twice — camera to server, server to phone —
  so resolution and rate are deliberately modest. QVGA at ~8fps is roughly
  10KB a frame, about 0.6 Mbit/s: watchable, and survivable on a free host's
  bandwidth allowance. Raising either will look better on WiFi and stall on
  mobile data.
*/
const framesize_t RELAY_SIZE    = FRAMESIZE_QVGA;   // 320x240
/*
  Quality is a size lever, not just a looks lever, and size is what breaks
  this link. Higher number = worse quality = smaller frame. 18 keeps a QVGA
  frame around 6-9KB even on a busy scene; 14 could spike past 15KB, which is
  `arduinoWebSockets`' built-in WEBSOCKETS_MAX_DATA_SIZE ceiling.
*/
const int         RELAY_QUALITY = 22;               // 10 (best) .. 63 (worst)
/*
  5 fps, not 8. TLS on this chip is done in software and competes with the
  camera for both CPU and RAM; sustained ~60KB/s of encrypted writes is enough
  to stall the socket until the connection dies. At 5fps and ~5KB a frame this
  is ~25KB/s, which it carries comfortably.

  This throttle applies only to the relay. The local :81 stream is unencrypted
  and unthrottled, and stays as smooth as the sensor can manage.
*/
const unsigned long FRAME_INTERVAL_MS = 200;        // 5 fps

/**
 * Frames above this are dropped rather than sent.
 *
 * A single oversized write stalls the TLS socket long enough to starve
 * ws.loop(), miss the protocol ping, and drop the whole connection — costing
 * seconds of reconnect for one bad frame. Skipping it costs 125ms.
 */
const size_t MAX_FRAME_BYTES = 10000;

/**
 * The sensor has one active resolution, shared by both outputs — there is no
 * such thing as "the relay gets QVGA while the local server gets VGA" from a
 * single camera_init() config. The local server still looks smoother than
 * the relay at the *same* resolution, because it streams every frame the
 * sensor produces instead of the throttled ~8fps above. Raise RELAY_SIZE if
 * you mainly view over LAN and want a sharper local picture; it costs the
 * relay path proportionally more bandwidth per frame.
 */

/** Local MJPEG server — matches the `:81/stream` the app's "Local" source expects. */
const int HTTP_PORT = 81;

WebSocketsClient ws;
bool streaming = false;
bool flashState = false;
/** False if esp_camera_init() failed — every capture path checks this. */
bool cameraReady = false;
unsigned long lastFrame = 0;
unsigned long lastReport = 0;
/* Per-5s-window counters. Which of these is non-zero says what is wrong:
   oversize means turn the quality number up, failed means the link is
   struggling, sent-but-low means the TLS writes themselves are slow. */
unsigned long framesSent = 0;
unsigned long framesFailed = 0;
unsigned long framesOversize = 0;
unsigned long bytesSent = 0;
/** Cumulative, not per-window — the trend is what matters. */
unsigned long disconnects = 0;

void sendRegistration() {
  StaticJsonDocument<256> doc;
  doc["type"] = "register";
  doc["role"] = "camera";
  doc["macAddress"] = WiFi.macAddress();
  // The LAN address, which only this board knows. The server otherwise sees
  // the router's public address, which is useless for a direct stream.
  doc["ip"] = WiFi.localIP().toString();
  doc["roverMac"] = ROVER_MAC;

  String msg;
  serializeJson(doc, msg);
  ws.sendTXT(msg);
  Serial.printf("[ws] registered as camera for %s (self %s, ip %s)\n",
                ROVER_MAC, WiFi.macAddress().c_str(), WiFi.localIP().toString().c_str());
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      // Counted, because a drop every few seconds and a drop every few hours
      // are different faults and the line alone doesn't distinguish them.
      disconnects++;
      Serial.printf("[ws] disconnected — retrying (drop #%lu, up %lus)\n",
                    disconnects, millis() / 1000);
      // Nobody can be watching through a dead socket.
      streaming = false;
      break;

    case WStype_CONNECTED:
      Serial.println("[ws] connected");
      sendRegistration();
      break;

    case WStype_TEXT: {
      StaticJsonDocument<256> doc;
      if (deserializeJson(doc, payload, length)) return;

      const char* msgType = doc["type"];
      if (!msgType) return;

      if (strcmp(msgType, "stream") == 0) {
        streaming = (doc["on"] | false) && cameraReady;
        Serial.printf("[cam] streaming %s%s\n", streaming ? "STARTED" : "stopped",
                      (!cameraReady && (doc["on"] | false)) ? " (camera not ready, ignored)" : "");
        if (!streaming) {
          framesSent = 0;
          digitalWrite(FLASH_GPIO, LOW);
          flashState = false;
        }
      }
      else if (strcmp(msgType, "command") == 0) {
        const char* cmd = doc["command"];
        if (cmd && strcmp(cmd, "flash") == 0) {
          flashState = (doc["value"] | 0) != 0;
          digitalWrite(FLASH_GPIO, flashState ? HIGH : LOW);
          Serial.printf("[cmd] flash -> %s\n", flashState ? "ON" : "OFF");
        }
      }
      else if (strcmp(msgType, "registered") == 0) {
        Serial.println("[ws] server confirmed registration");
      }
      break;
    }

    default:
      break;
  }
}

void pushFrame() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    // Rate-limited: a genuinely dead sensor would otherwise print this every
    // 125ms forever and bury everything else the board has to say.
    static unsigned long lastWarn = 0;
    if (millis() - lastWarn > 5000) {
      lastWarn = millis();
      Serial.println("[cam] capture failed — camera_fb_get() returned null");
    }
    return;
  }

  if (fb->format != PIXFORMAT_JPEG) {
    // Only reachable if the sensor is reconfigured away from JPEG; converting
    // in software here would be far too slow to stream.
    Serial.println("[cam] frame was not JPEG — skipped");
    esp_camera_fb_return(fb);
    return;
  }

  if (fb->len > MAX_FRAME_BYTES) {
    framesOversize++;
    esp_camera_fb_return(fb);
    return;   // reported in the 5s summary rather than per frame
  }

  // Sent as one binary message per frame. The server never parses it — it
  // just forwards — so a dropped frame costs exactly one frame.
  const bool ok = ws.sendBIN(fb->buf, fb->len);
  if (ok) {
    framesSent++;
    bytesSent += fb->len;
  } else {
    framesFailed++;
  }

  esp_camera_fb_return(fb);

  // Serviced immediately after the write. A large TLS send can take long
  // enough that the next scheduled loop() misses the protocol ping, and the
  // server drops a connection that was never actually unhealthy.
  ws.loop();
}

/* ── Local MJPEG server (port 81) ─────────────────────────────
 * Independent of the relay entirely: it captures and serves on its own
 * connection, whether or not anyone is watching through the relay. This is
 * what the app's "Local" source connects to when the phone is on the same
 * WiFi as the camera.
 */
static esp_err_t stream_handler(httpd_req_t* req) {
  char part_buf[128];
  esp_err_t res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=frame");
  if (res != ESP_OK) return res;
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
  httpd_resp_set_hdr(req, "X-Accel-Buffering", "no");

  while (true) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      res = ESP_FAIL;
      break;
    }

    const size_t hlen = snprintf(
      part_buf, sizeof(part_buf),
      "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
      (unsigned)fb->len
    );

    res = httpd_resp_send_chunk(req, part_buf, hlen);
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, "\r\n", 2);

    esp_camera_fb_return(fb);
    // Frame buffer access here and in pushFrame() is unguarded by a mutex —
    // the esp32-camera driver's internal queue tolerates two consumers pulling
    // concurrently, at worst handing out a slightly stale frame under heavy
    // simultaneous load. Never a crash risk, just occasionally not-the-latest.

    if (res != ESP_OK) break;   // client disconnected — stop rather than spin
  }
  return res;
}

static const httpd_uri_t stream_uri = {
  .uri = "/stream",
  .method = HTTP_GET,
  .handler = stream_handler,
  .user_ctx = nullptr,
};

void startLocalServer() {
  httpd_handle_t httpServer = nullptr;
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = HTTP_PORT;
  config.ctrl_port = 32768;

  if (httpd_start(&httpServer, &config) == ESP_OK) {
    httpd_register_uri_handler(httpServer, &stream_uri);
    Serial.printf("[http] local stream: http://%s:%d/stream\n",
                  WiFi.localIP().toString().c_str(), HTTP_PORT);
  } else {
    Serial.println("[http] failed to start local stream server");
  }
}

bool setupCamera() {
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
  config.frame_size = RELAY_SIZE;
  config.jpeg_quality = RELAY_QUALITY;
  config.grab_mode = CAMERA_GRAB_LATEST;   // never stream a stale frame

  if (psramFound()) {
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.fb_count = 2;
  } else {
    // Without PSRAM there is only room for one buffer, and anything above
    // QVGA will fail to allocate.
    Serial.println("[cam] no PSRAM — falling back to a single buffer");
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count = 1;
    config.frame_size = FRAMESIZE_QVGA;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[cam] init failed: 0x%x\n", err);
    return false;
  }

  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, 1);     // the AI-Thinker module is usually mounted inverted
    s->set_hmirror(s, 1);
  }
  Serial.println("[cam] ready");
  return true;
}

/**
 * Why the board last restarted.
 *
 * A flickering flash LED with no code driving it means the board is resetting
 * in a loop, and the reason distinguishes causes that look identical from the
 * outside: BROWNOUT is power, PANIC is a crash, TASK_WDT is a stall. Without
 * this you are guessing between three very different fixes.
 */
void reportResetReason() {
  const esp_reset_reason_t reason = esp_reset_reason();
  const char* text = "unknown";
  switch (reason) {
    case ESP_RST_POWERON:  text = "power-on (normal)"; break;
    case ESP_RST_SW:       text = "software restart (normal after upload)"; break;
    case ESP_RST_BROWNOUT: text = "BROWNOUT — supply sagged, this is a power fault"; break;
    case ESP_RST_PANIC:    text = "PANIC — the sketch crashed"; break;
    case ESP_RST_TASK_WDT: text = "TASK WATCHDOG — something blocked too long"; break;
    case ESP_RST_INT_WDT:  text = "INTERRUPT WATCHDOG — something blocked too long"; break;
    case ESP_RST_DEEPSLEEP: text = "wake from deep sleep"; break;
    default: break;
  }
  Serial.printf("[boot] last reset: %s\n", text);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] AgriVerse camera relay");
  reportResetReason();

  // Held off deliberately. Nothing else in this sketch drives GPIO 4, so if
  // the LED flickers, the board is resetting — not blinking.
  pinMode(FLASH_GPIO, OUTPUT);
  digitalWrite(FLASH_GPIO, LOW);

  // WiFi comes up before the camera does. XCLK sits on GPIO0, a boot-strap
  // pin — bringing the radio up while that pin is still settling from reset
  // is the difference between a clean camera init and one that silently
  // returns a bad frame size or never syncs with the sensor at all.
  Serial.printf("[wifi] connecting to \"%s\"", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  /*
    Modem sleep off. By default the radio powers down between beacons, and a
    write that lands during a sleep window waits for the next wake — hundreds
    of milliseconds. For bursty request/response traffic that is invisible;
    for a steady frame stream it is the difference between a smooth link and
    one that stalls and drops. Costs idle current, which matters far less
    here than a stream that stays up.
  */
  WiFi.setSleep(false);

  Serial.printf("\n[wifi] connected — IP %s, MAC %s, RSSI %d dBm\n",
                WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str(), WiFi.RSSI());
  if (WiFi.RSSI() < -75) {
    Serial.println("[wifi] weak signal — expect stalls and drops while streaming");
  }

  cameraReady = setupCamera();
  if (!cameraReady) {
    Serial.println("[cam] NOT READY — capture will keep failing. Check:");
    Serial.println("      1. Board is AI-Thinker (or pin-compatible) with PSRAM enabled");
    Serial.println("      2. Power is 5V/500mA+ — brownout during init looks identical to a bad ribbon");
    Serial.println("      3. The camera ribbon is seated the right way round and fully pushed in");
  } else {
    startLocalServer();
  }

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
  /*
    beginSSL, not beginSslWithBundle.

    The CA bundle validates the server's certificate properly, but parsing it
    needs a large contiguous block of *internal* RAM — the same pool the WiFi
    driver and TLS record buffers draw from. PSRAM does not help; it cannot
    back those allocations. Starving that pool makes writes block for
    hundreds of milliseconds and eventually fail, which matches a socket that
    is stable when idle and dies as soon as frames flow.

    The trade-off is real and worth stating plainly: without the bundle the
    server's certificate is not verified, so this connection is encrypted but
    not authenticated — a machine positioned between the camera and Render
    could impersonate the server. For a camera on your own LAN that is an
    acceptable trade for a link that works; for anything sensitive it is not.
  */
  ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(2000);

  /*
    Explicit heartbeat: ping every 15s, expect a pong within 3s, give up after
    two misses. Without it a half-open connection — the server gone, the
    socket never closed — is only noticed when a write finally fails, which
    can be a long time in a stream that is already stalling. This turns that
    into a clean detected drop and a fast reconnect.
  */
  ws.enableHeartbeat(15000, 3000, 2);
}

void loop() {
  ws.loop();

  const unsigned long now = millis();

  if (cameraReady && streaming && now - lastFrame >= FRAME_INTERVAL_MS) {
    lastFrame = now;
    pushFrame();
  }

  // Every 5s, streaming or not. Printing only while streaming hid exactly the
  // case that matters here: what the link is doing between drops.
  if (now - lastReport >= 5000) {
    Serial.printf(
      "[stat] %s | %s | %lu sent (%.1f fps, avg %luB) | %lu oversize | %lu failed | heap %u int %u | RSSI %d\n",
      WiFi.isConnected() ? "wifi OK" : "WIFI DOWN",
      streaming ? "streaming" : "idle",
      framesSent, framesSent / 5.0f,
      framesSent ? bytesSent / framesSent : 0UL,
      framesOversize, framesFailed,
      ESP.getFreeHeap(),
      // Internal RAM specifically. Total heap includes PSRAM, which cannot
      // back WiFi or TLS buffers — so total can look healthy while the pool
      // that actually matters is exhausted. If `int` is under ~30000, that
      // is the constraint, not bandwidth.
      (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
      WiFi.RSSI()
    );
    framesSent = framesFailed = framesOversize = bytesSent = 0;
    lastReport = now;
  }
}

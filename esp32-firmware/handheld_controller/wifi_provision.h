#pragma once

/*
  AgriVerse Rover — WiFi provisioning

  Credentials live in NVS instead of in the sketch, so moving to a new network
  is a two-minute job on a phone rather than an edit-and-reflash.

  ── How it behaves ────────────────────────────────────────────
    1. On boot, try whatever is stored. If it joins, done.
    2. If nothing is stored, or the join fails, start an access point with a
       captive portal.
    3. Connect a phone to that AP; the setup page opens by itself. Pick a
       network from the scan, type the password, save.
    4. The board joins and remembers. The AP disappears.

  ── Why an AP and not on-screen entry ─────────────────────────
  A WPA2 password is commonly twenty-odd mixed-case characters. Entering that
  with a five-way pad means several hundred button presses and is miserable
  enough that people avoid changing networks at all. A phone keyboard is the
  right tool, and the pad is left to pick the network from a scanned list if
  you would rather not type the SSID.

  ── Header-only ───────────────────────────────────────────────
  Everything here is `inline` so this can be included from a sketch without a
  separate .cpp. Only the ESP32 core is required — WebServer, DNSServer and
  Preferences all ship with it, so there is no library to install.
*/

#include <WiFi.h>

/*
  ── Why these three lines come before WebServer.h ─────────────

  FS.h declares its classes inside `namespace fs` and then, at the bottom,
  aliases them into the global namespace — but only when FS_NO_GLOBALS is not
  defined. TFT_eSPI defines it, to keep its own file handling from clashing.

  WebServer.h then refers to `FS` unqualified:

      typedef std::function<String(FS &fs, const String &fName)> ETagFunction;

  With TFT_eSPI included first, that alias is gone and the compile fails with
  "'FS' was not declared in this scope; did you mean 'fs::FS'?".

  Restoring the two names by hand fixes it for good, and does so here rather
  than in the sketch so any file including this header is covered. This is the
  same workaround the reference sketch used with `using fs::File;`.
*/
#include <FS.h>
using fs::FS;
using fs::File;

#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

namespace wifiprov {

/** Where the AP-mode web server answers, and what the DNS server points at. */
inline const IPAddress AP_IP(192, 168, 4, 1);
inline const byte DNS_PORT = 53;

/** Long enough for a slow router, short enough not to feel broken. */
inline const unsigned long JOIN_TIMEOUT_MS = 15000;

inline Preferences prefs;
inline WebServer server(80);
inline DNSServer dns;

inline bool portalRunning = false;
inline String apName;
inline String pendingSsid;
inline String pendingPass;
inline bool savePending = false;
inline String scanCache;
inline unsigned long scanCachedAt = 0;

/* ── storage ──────────────────────────────────────────────── */

inline void save(const String& ssid, const String& pass) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
}

inline bool load(String& ssid, String& pass) {
  prefs.begin("wifi", true);
  ssid = prefs.getString("ssid", "");
  pass = prefs.getString("pass", "");
  prefs.end();
  return ssid.length() > 0;
}

/** The SSID currently stored, or empty. Lets the UI mark a network as known. */
inline String savedSsid() {
  String s, p;
  load(s, p);
  return s;
}

/** Forget the stored network. The next boot goes to the portal. */
inline void forget() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.end();
  Serial.println("[wifi] stored credentials cleared");
}

inline bool hasStored() {
  String s, p;
  return load(s, p);
}

/* ── joining ──────────────────────────────────────────────── */

/**
 * Try to join, blocking until connected or timed out.
 *
 * Blocking is fine here: nothing this device does is meaningful without a
 * network, and a non-blocking join would only complicate every caller for no
 * behaviour anyone would notice.
 */
inline bool join(const String& ssid, const String& pass, unsigned long timeoutMs = JOIN_TIMEOUT_MS) {
  if (ssid.isEmpty()) return false;

  Serial.printf("[wifi] joining \"%s\"\n", ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  const unsigned long started = millis();
  while (!WiFi.isConnected() && millis() - started < timeoutMs) delay(200);

  if (WiFi.isConnected()) {
    Serial.printf("[wifi] joined, IP %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  Serial.println("[wifi] join failed");
  return false;
}

/**
 * What selecting a network on the device can actually do.
 *
 * Only two cases need no typing, and they are the only two worth offering:
 * an open network, or one whose password is already stored. Anything else has
 * to go through the portal, because a WPA2 key cannot reasonably be entered on
 * a five-way pad.
 */
enum PickResult : uint8_t {
  PICK_JOINED,       // connected and saved
  PICK_FAILED,       // tried, did not join — stored credentials untouched
  PICK_NEEDS_PASS,   // secured and unknown; the caller should raise the portal
};

/**
 * Join a network chosen on the device itself.
 *
 * On failure the stored credentials are deliberately left alone: a mistyped
 * or out-of-range pick must not cost you the network that was working.
 */
inline PickResult pick(const String& ssid, bool isOpen) {
  if (ssid.isEmpty()) return PICK_NEEDS_PASS;

  String storedSsid, storedPass;
  const bool known = load(storedSsid, storedPass) && storedSsid == ssid;

  if (!isOpen && !known) return PICK_NEEDS_PASS;

  const String pass = known ? storedPass : String();
  if (!join(ssid, pass)) return PICK_FAILED;

  save(ssid, pass);
  return PICK_JOINED;
}

/* ── the setup page ───────────────────────────────────────── */

/** Scan results as <option> rows, cached — a scan takes a couple of seconds. */
inline String scanOptions(bool force = false, const String& prefer = String()) {
  // The cache is skipped whenever a network is being pre-selected: the whole
  // point is that this render differs from the last one.
  if (!force && prefer.isEmpty() && scanCache.length() && millis() - scanCachedAt < 20000)
    return scanCache;

  const int found = WiFi.scanNetworks();
  String out;
  for (int i = 0; i < found; i++) {
    const String ssid = WiFi.SSID(i);
    if (ssid.isEmpty()) continue;
    const int bars = WiFi.RSSI(i) > -60 ? 3 : WiFi.RSSI(i) > -75 ? 2 : 1;
    // Marked selected when the device already chose it, so the phone only has
    // to supply the password.
    const bool preferred = prefer.length() && ssid == prefer;
    out += "<option value=\"" + ssid + "\"" + (preferred ? " selected" : "") + ">" + ssid + "  " +
           String(bars == 3 ? "▂▄▆" : bars == 2 ? "▂▄" : "▂") +
           (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "  open" : "") + "</option>";
  }
  WiFi.scanDelete();

  if (prefer.isEmpty()) {
    scanCache = out;
    scanCachedAt = millis();
  }
  return out;
}

inline String preferSsid;

inline String page(const String& message = "") {
  String html =
    "<!doctype html><html><head><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>AgriVerse Rover setup</title><style>"
    "*{box-sizing:border-box}"
    "body{margin:0;padding:24px;background:#0B0F1C;color:#FFF7ED;"
    "font-family:system-ui,-apple-system,sans-serif;line-height:1.5}"
    ".card{max-width:420px;margin:0 auto;background:#161B2E;border:1px solid #2A3145;"
    "border-radius:20px;padding:24px}"
    "h1{margin:0 0 4px;font-size:20px}"
    "p.sub{margin:0 0 20px;color:#B8A99B;font-size:14px}"
    "label{display:block;margin:16px 0 6px;font-size:11px;letter-spacing:.12em;"
    "text-transform:uppercase;color:#B8A99B}"
    "select,input{width:100%;padding:12px;border-radius:12px;border:1px solid #2A3145;"
    "background:#0B0F1C;color:#FFF7ED;font-size:16px}"
    "button{width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;"
    "background:#B8532E;color:#FFF7ED;font-size:16px;font-weight:600}"
    ".msg{margin-bottom:16px;padding:12px;border-radius:12px;background:#1E2538;"
    "border:1px solid #E8825A;color:#E8825A;font-size:14px}"
    "a{color:#E8825A}"
    "</style></head><body><div class=card>"
    "<h1>AgriVerse Rover</h1><p class=sub>Choose a network for this device.</p>";

  if (message.length()) html += "<div class=msg>" + message + "</div>";

  html +=
    "<form method=POST action=/save>"
    "<label>Network</label><select name=ssid>" + scanOptions(false, preferSsid) + "</select>"
    "<label>Password</label>"
    "<input name=pass type=password placeholder='leave blank if open' autocomplete=off>"
    "<button type=submit>Save and connect</button></form>"
    "<p class=sub style='margin-top:18px'><a href='/?rescan=1'>Rescan networks</a></p>"
    "</div></body></html>";
  return html;
}

/* ── request handlers ─────────────────────────────────────── */

inline void handleRoot() {
  if (server.hasArg("rescan")) scanOptions(true);
  server.send(200, "text/html", page());
}

inline void handleSave() {
  pendingSsid = server.arg("ssid");
  pendingPass = server.arg("pass");

  if (pendingSsid.isEmpty()) {
    server.send(200, "text/html", page("Pick a network first."));
    return;
  }

  // Answered before the join is attempted, because joining drops the AP and
  // with it this connection — the phone would show a failed request even on
  // success, which reads as "it did not work".
  server.send(200, "text/html",
    "<!doctype html><html><head><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<style>body{margin:0;padding:24px;background:#0B0F1C;color:#FFF7ED;"
    "font-family:system-ui,sans-serif;text-align:center}</style></head><body>"
    "<h2>Connecting to " + pendingSsid + "</h2>"
    "<p>Watch the device screen. This network will disappear in a moment.</p>"
    "</body></html>");

  savePending = true;
}

/**
 * Anything we do not recognise gets the setup page.
 *
 * Phones probe a handful of known URLs to detect a captive portal, and
 * answering all of them with the form is what makes the page open by itself
 * instead of the user having to find 192.168.4.1.
 */
inline void handleNotFound() {
  server.sendHeader("Location", "http://" + AP_IP.toString() + "/", true);
  server.send(302, "text/plain", "");
}

/* ── portal ───────────────────────────────────────────────── */

inline void startPortal(const String& name, const String& prefer = String()) {
  apName = name;
  preferSsid = prefer;

  WiFi.mode(WIFI_AP_STA);   // STA too, so scanning works while the AP is up
  WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(name.c_str());

  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(DNS_PORT, "*", AP_IP);   // every lookup answers with us

  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleNotFound);
  server.begin();

  portalRunning = true;
  Serial.printf("[wifi] setup portal up — join \"%s\" then open http://%s/\n",
                name.c_str(), AP_IP.toString().c_str());
}

inline void stopPortal() {
  if (!portalRunning) return;
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portalRunning = false;
  Serial.println("[wifi] setup portal closed");
}

inline bool portalActive() { return portalRunning; }
inline String portalName()  { return apName; }
inline String portalUrl()   { return "http://" + AP_IP.toString(); }

/**
 * Service the portal. Call from loop().
 *
 * Returns true on the pass where a submitted network joined successfully, so
 * the caller can redraw or carry on with setup.
 */
inline bool loopPortal() {
  if (!portalRunning) return false;

  dns.processNextRequest();
  server.handleClient();

  if (!savePending) return false;
  savePending = false;

  // Given a moment so the response actually reaches the phone before the AP
  // goes down underneath it.
  delay(600);

  if (join(pendingSsid, pendingPass)) {
    save(pendingSsid, pendingPass);
    stopPortal();
    return true;
  }

  // Failed: keep the portal up so the password can be corrected. The AP was
  // never taken down, so the phone is still attached.
  Serial.println("[wifi] submitted credentials did not work");
  WiFi.mode(WIFI_AP_STA);
  return false;
}

/**
 * The whole flow: try what is stored, fall back to the portal.
 *
 * `forcePortal` skips straight to setup — wire it to a button held at boot so
 * a device on the wrong network can be recovered without a cable.
 */
inline bool begin(const String& apNameIfNeeded, bool forcePortal = false) {
  String ssid, pass;

  if (!forcePortal && load(ssid, pass) && join(ssid, pass)) return true;

  if (forcePortal) Serial.println("[wifi] setup forced");
  startPortal(apNameIfNeeded);
  return false;
}

}  // namespace wifiprov

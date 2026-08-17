#pragma once
/*
  Supabase from the handset — sign in, and list the rovers on that account.

  Header-only, like wifi_provision.h, so the sketch stays one translation unit
  and the Arduino IDE needs no library entry.

  ── What this talks to ────────────────────────────────────────
  Two plain REST calls against the same project the web console uses:

    POST /auth/v1/token?grant_type=password   email + password -> tokens
    GET  /rest/v1/rovers?select=...           the caller's rovers

  Nothing filters that second call by user. It does not need to: the `rovers`
  table has row level security keyed on `owner_id = auth.uid()`, so Postgres
  returns only the rows belonging to whoever the JWT names. Asking for every
  rover and receiving only yours is the design, not an oversight.

  ── The anon key ──────────────────────────────────────────────
  Lives in supabase_config.h, which is NOT in the repository — the same
  arrangement the web app uses for web/.env.local. Copy the example file beside
  it and paste the key from the Supabase dashboard.

  It is a publishable key and is meant to be readable by clients; the browser
  ships it in plain JavaScript. RLS is the actual boundary, not the key's
  secrecy. It stays out of the repo because a public repo is a wider audience
  than a browser bundle, not because possessing it grants anything.

  ⚠ Never put the SERVICE ROLE key here. That one bypasses RLS entirely, and on
  a handset it would hand every account's rovers to anyone holding the device.
*/

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "supabase_config.h"

namespace supa {

/** One row of `public.rovers`, trimmed to what the handset shows. */
struct Rover {
  String name;
  String mac;
};

const int MAX_ROVERS = 8;

inline Preferences prefs;
inline const char* NS = "supa";

/** Set after a successful sign-in. */
inline String accessToken;
inline String refreshToken;
inline String userEmail;
inline String lastError;

/*
  One TLS client, reused.

  Each WiFiClientSecure carries its own ~40KB of TLS buffers, and building a
  fresh one per request on a board that is also holding a WebSocket open and a
  framebuffer is how you meet the heap ceiling. Reused, the cost is paid once.
*/
inline WiFiClientSecure* tls = nullptr;

inline WiFiClientSecure& client() {
  if (!tls) {
    tls = new WiFiClientSecure();
    /*
      Unvalidated, deliberately and consistently with the rest of the project.

      Validating the chain needs a correct clock, the clock comes from NTP, and
      NTP needs the network that is being brought up. On a hotspot that blocks
      UDP 123 the handset would have no time source and every request would
      fail against a 1970 date — which presents as "wrong password".

      Stated plainly: the connection stays encrypted, but the server is not
      authenticated, so a machine in the path could impersonate Supabase and
      collect the password typed into this screen. That is a real trade, made
      because a field handset that cannot log in is useless, and it is the same
      trade rover_controller.ino already makes for the relay.
    */
    tls->setInsecure();
    tls->setTimeout(12000);
  }
  return *tls;
}

/* ── stored session ────────────────────────────────────────── */

/**
 * Remember the refresh token, not the password.
 *
 * The password is never written to flash. A refresh token can be revoked from
 * the Supabase dashboard if the handset is lost; a password cannot be, without
 * changing it everywhere it is used.
 */
inline void saveSession() {
  prefs.begin(NS, false);
  prefs.putString("refresh", refreshToken);
  prefs.putString("email", userEmail);
  prefs.end();
}

inline void forgetSession() {
  prefs.begin(NS, false);
  prefs.clear();
  prefs.end();
  accessToken = refreshToken = userEmail = "";
}

inline bool loadSession() {
  prefs.begin(NS, true);
  refreshToken = prefs.getString("refresh", "");
  userEmail = prefs.getString("email", "");
  prefs.end();
  return refreshToken.length() > 0;
}

/* ── requests ──────────────────────────────────────────────── */

/** Shared setup for every call: the anon key, and JSON. */
inline void addCommonHeaders(HTTPClient& http) {
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
}

/**
 * Pull a human-readable reason out of Supabase's error body.
 *
 * The status code alone is not enough to act on: a 400 from the token endpoint
 * is a wrong password, and a 400 from a malformed request is a bug. The body
 * distinguishes them, and the user gets told which one happened.
 */
inline String errorFrom(int status, const String& body) {
  StaticJsonDocument<384> doc;
  if (deserializeJson(doc, body) == DeserializationError::Ok) {
    const char* m = doc["error_description"] | doc["msg"] | doc["message"] | doc["error"];
    if (m && *m) return String(m);
  }
  if (status == 400 || status == 401) return "Wrong email or password";
  if (status == 422) return "Check the email format";
  if (status <= 0)   return "No reply - check WiFi";
  return "Server said " + String(status);
}

/** Exchange tokens for the pair we keep. Shared by sign-in and refresh. */
inline bool storeTokens(const String& body) {
  StaticJsonDocument<1536> doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    lastError = "Bad reply from server";
    return false;
  }
  const char* at = doc["access_token"];
  const char* rt = doc["refresh_token"];
  if (!at || !rt) {
    lastError = "No token in reply";
    return false;
  }
  accessToken = at;
  refreshToken = rt;
  const char* em = doc["user"]["email"];
  if (em) userEmail = em;
  return true;
}

/** Email + password against Supabase Auth. True on success. */
inline bool signIn(const String& email, const String& password) {
  lastError = "";
  HTTPClient http;
  const String url = String(SUPABASE_URL) + "/auth/v1/token?grant_type=password";
  if (!http.begin(client(), url)) {
    lastError = "Could not open connection";
    return false;
  }
  addCommonHeaders(http);

  StaticJsonDocument<256> body;
  body["email"] = email;
  body["password"] = password;
  String payload;
  serializeJson(body, payload);

  const int status = http.POST(payload);
  const String reply = http.getString();
  http.end();

  if (status != 200) {
    lastError = errorFrom(status, reply);
    Serial.printf("[supa] sign-in failed: %d %s\n", status, lastError.c_str());
    return false;
  }
  if (!storeTokens(reply)) return false;

  userEmail = email;
  saveSession();
  Serial.printf("[supa] signed in as %s\n", userEmail.c_str());
  return true;
}

/**
 * Trade the stored refresh token for a fresh access token.
 *
 * Access tokens expire in an hour by default, so a handset switched on the
 * next morning has a stored session that is valid and an access token that is
 * not. Without this the user would be asked to type their password daily.
 */
inline bool refresh() {
  if (!refreshToken.length()) return false;
  lastError = "";

  HTTPClient http;
  const String url = String(SUPABASE_URL) + "/auth/v1/token?grant_type=refresh_token";
  if (!http.begin(client(), url)) return false;
  addCommonHeaders(http);

  StaticJsonDocument<512> body;
  body["refresh_token"] = refreshToken;
  String payload;
  serializeJson(body, payload);

  const int status = http.POST(payload);
  const String reply = http.getString();
  http.end();

  if (status != 200) {
    lastError = errorFrom(status, reply);
    Serial.printf("[supa] refresh failed: %d — signing out\n", status);
    // A refused refresh means the session is genuinely finished: revoked,
    // password changed, or expired past recovery. Keeping it would retry
    // forever against a token that will never work again.
    forgetSession();
    return false;
  }
  if (!storeTokens(reply)) return false;
  saveSession();
  Serial.println("[supa] session refreshed");
  return true;
}

/**
 * The signed-in user's rovers, newest first.
 *
 * @return how many were written to `out`, or -1 on failure.
 */
inline int fetchRovers(Rover* out, int max) {
  if (!accessToken.length()) {
    lastError = "Not signed in";
    return -1;
  }
  lastError = "";

  HTTPClient http;
  const String url = String(SUPABASE_URL) +
    "/rest/v1/rovers?select=name,mac_address&order=created_at.desc&limit=" + String(max);
  if (!http.begin(client(), url)) {
    lastError = "Could not open connection";
    return -1;
  }
  addCommonHeaders(http);
  // RLS reads the user from this token. Without it PostgREST runs as the anon
  // role, which the policy gives nothing, and the reply is an empty list rather
  // than an error — "you have no rovers" instead of "you are not signed in".
  http.addHeader("Authorization", "Bearer " + accessToken);

  const int status = http.GET();
  const String reply = http.getString();
  http.end();

  if (status != 200) {
    lastError = errorFrom(status, reply);
    Serial.printf("[supa] rovers failed: %d %s\n", status, lastError.c_str());
    return -1;
  }

  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, reply) != DeserializationError::Ok) {
    lastError = "Bad rover list";
    return -1;
  }

  int n = 0;
  for (JsonObject row : doc.as<JsonArray>()) {
    if (n >= max) break;
    const char* mac = row["mac_address"];
    if (!mac) continue;
    out[n].mac = mac;
    const char* nm = row["name"];
    out[n].name = (nm && *nm) ? nm : mac;
    n++;
  }
  Serial.printf("[supa] %d rover%s on %s\n", n, n == 1 ? "" : "s", userEmail.c_str());
  return n;
}

}  // namespace supa

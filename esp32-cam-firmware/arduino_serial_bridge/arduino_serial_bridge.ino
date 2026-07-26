/*
  Arduino USB-to-Serial Bridge for ESP32-CAM upload
  - D10 (RX) ← ESP32 TX (U0T / GPIO1)
  - D11 (TX) → ESP32 RX (U0R / GPIO3)
  - Bridges USB Serial ↔ SoftwareSerial at 57600 baud
  - Power ESP32-CAM externally (NOT from Arduino's 5V pin)
*/

#include <SoftwareSerial.h>

#define BRIDGE_RX 10  // ← ESP32 TX (listens)
#define BRIDGE_TX 11  // → ESP32 RX (sends)

SoftwareSerial espSerial(BRIDGE_RX, BRIDGE_TX);

void setup() {
  Serial.begin(57600);
  espSerial.begin(57600);
}

void loop() {
  while (Serial.available()) {
    espSerial.write(Serial.read());
  }
  while (espSerial.available()) {
    Serial.write(espSerial.read());
  }
}

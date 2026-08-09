/*
  I2C bus scanner

  No WiFi, no libraries, no assumptions. Walks every address on the bus and
  reports what answers. This settles in one pass whether the MPU6050 is
  actually present, whether it is at the address the code expects, and
  whether the bus works at all.

  Flash it, open the serial monitor at 115200, and read the list.

  Expected addresses in this project:
    0x68 or 0x69  MPU6050 (AD0 low / high)
    0x27 or 0x3F  16x2 LCD backpack
*/

#include <Wire.h>

// The same pins the other sketches use.
#define I2C_SDA 21
#define I2C_SCL 22

void scan(uint32_t hz) {
  Wire.setClock(hz);
  Serial.printf("\n--- scanning at %lukHz ---\n", (unsigned long)(hz / 1000));

  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    const uint8_t err = Wire.endTransmission();

    if (err == 0) {
      Serial.printf("  0x%02X  responding", addr);
      if (addr == 0x68 || addr == 0x69) Serial.print("   <- MPU6050");
      if (addr == 0x27 || addr == 0x3F) Serial.print("   <- LCD backpack");
      Serial.println();
      found++;
    } else if (err == 4) {
      Serial.printf("  0x%02X  bus error\n", addr);
    }
  }

  if (found == 0) {
    Serial.println("  nothing responded");
  } else {
    Serial.printf("  %d device%s found\n", found, found == 1 ? "" : "s");
  }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\n=====================================");
  Serial.println("  I2C scanner");
  Serial.printf("  SDA = GPIO %d, SCL = GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.println("=====================================");

  Wire.begin(I2C_SDA, I2C_SCL);

  /*
    Two speeds, because they fail differently.

    A module with no pull-up resistors of its own, or on long jumper leads,
    can answer reliably at 100kHz and not at all at 400kHz. Seeing a device
    appear at the slower speed and vanish at the faster one is a wiring
    quality problem, not a dead sensor.
  */
  scan(100000);
  scan(400000);

  Serial.println("\nIf nothing responded at either speed:");
  Serial.println("  1. SDA and SCL swapped is the most common cause");
  Serial.println("  2. VCC must be 3V3 (5V works on some modules, not all)");
  Serial.println("  3. GND must be shared with the ESP32");
  Serial.println("  4. Try a different module — clone boards do fail");
}

void loop() {
  delay(5000);
  scan(100000);
}

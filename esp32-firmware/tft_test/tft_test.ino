/*
  AgriVerse Rover — TFT bench test (TFT_eSPI)

  Upload this first. No WiFi, no MPU, no SPIFFS, no JPEG — the display and its
  configuration are the only things that can be at fault.

  ── Where the pins come from ──────────────────────────────────
  Not from this sketch. TFT_eSPI reads them at compile time from

      <Arduino>/libraries/TFT_eSPI/User_Setup.h

  which is why `TFT_eSPI tft = TFT_eSPI()` takes no arguments, and why a
  correct sketch shows nothing when that file is wrong. The repo keeps a copy
  of the right one at esp32-firmware/TFT_eSPI_User_Setup.h — a library update
  reverts the installed copy without saying so.

  This sketch prints the compiled-in settings over serial, so the monitor tells
  you what the binary actually believes regardless of what you meant.

  ── Wiring (module label -> ESP32) ────────────────────────────
      VCC -> 3V3     GND -> GND     LED -> 3V3
      SCK -> 18      SDA -> 23      ← SDA is SPI MOSI, not I2C
      CS  -> 5       A0  -> 27      ← A0 is Data/Command
      RESET -> 26

  ── Reading the result ────────────────────────────────────────
    Dark screen        backlight has no power — check LED and VCC.
    White screen       powered, but no data. Check A0 and SDA first.
    Colours + border   working. Note anything odd and see the notes below.

  Serial monitor at 115200.
*/

#include <TFT_eSPI.h>
#include <SPI.h>

TFT_eSPI tft = TFT_eSPI();

/** Report what the binary was actually built with, not what was intended. */
void reportConfig() {
  Serial.println("\n=== compiled configuration ===");
#ifdef USER_SETUP_INFO
  Serial.printf("  setup    : %s\n", USER_SETUP_INFO);
#endif

#if defined(ST7735_DRIVER)
  Serial.println("  driver   : ST7735   <- correct for a 1.8in 128x160 panel");
#elif defined(ILI9341_DRIVER)
  Serial.println("  driver   : ILI9341  <- WRONG for a 128x160 panel");
  Serial.println("             User_Setup.h is still the stock file.");
#elif defined(ST7789_DRIVER)
  Serial.println("  driver   : ST7789");
#else
  Serial.println("  driver   : something else");
#endif

  Serial.printf("  declared : %d x %d\n", TFT_WIDTH, TFT_HEIGHT);
  Serial.printf("  runtime  : %d x %d\n", tft.width(), tft.height());
  Serial.printf("  pins     : MOSI=%d SCLK=%d CS=%d DC=%d RST=%d\n",
                TFT_MOSI, TFT_SCLK, TFT_CS, TFT_DC, TFT_RST);
  Serial.printf("  spi      : %d Hz\n", SPI_FREQUENCY);

#if defined(ST7735_BLACKTAB)
  Serial.println("  variant  : BLACKTAB");
#elif defined(ST7735_GREENTAB)
  Serial.println("  variant  : GREENTAB");
#elif defined(ST7735_REDTAB)
  Serial.println("  variant  : REDTAB");
#endif
  Serial.println("==============================");
  Serial.flush();
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\n[boot] TFT bench test (TFT_eSPI)");

  tft.init();
  tft.setRotation(1);          // landscape: 160 wide, 128 tall
  tft.fillScreen(TFT_BLACK);

  reportConfig();
}

void loop() {
  // Solid fills. If any of these appear, pixels are being written and the
  // wiring is right — everything after this is only about appearance.
  const uint16_t fills[] = { TFT_RED, TFT_GREEN, TFT_BLUE };
  const char* names[]    = { "RED", "GREEN", "BLUE" };

  for (int i = 0; i < 3; i++) {
    tft.fillScreen(fills[i]);
    Serial.printf("  fill %s\n", names[i]);
    Serial.flush();
    delay(600);
  }

  // A frame that makes geometry faults obvious: the border sits hard against
  // all four edges, so an offset panel shows a white line on one side and a
  // gap on the other. The corner blocks show which way rotation went.
  tft.fillScreen(TFT_BLACK);
  tft.drawRect(0, 0, tft.width(), tft.height(), TFT_WHITE);
  tft.fillRect(0, 0, 8, 8, TFT_RED);
  tft.fillRect(tft.width() - 8, tft.height() - 8, 8, 8, TFT_BLUE);

  tft.setTextWrap(false);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.drawString("AgriVerse", 10, 14);

  tft.setTextSize(1);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString(String(tft.width()) + "x" + String(tft.height()), 10, 38);

  tft.setTextColor(0x8410, TFT_BLACK);
  tft.drawString("Border touches all edges?", 10, 56);
  tft.drawString("Red block top-left,", 10, 68);
  tft.drawString("blue bottom-right.", 10, 78);
  tft.drawString("Colours look right?", 10, 94);

  Serial.println("  frame drawn — check border, corners and colours");
  Serial.flush();
  delay(5000);
}

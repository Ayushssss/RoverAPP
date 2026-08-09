/*
  AgriVerse Rover — TFT_eSPI configuration

  TFT_eSPI does not take its pins from the sketch. It reads them from this
  file at compile time, which is why a perfectly correct sketch shows nothing
  when this is wrong — and the stock file that ships with the library is wrong
  for this hardware in two separate ways:

    • it selects ILI9341, a 240x320 controller, not the ST7735 in a 1.8" panel
    • its pins are named PIN_D5..PIN_D8, which are ESP8266/NodeMCU names

  Either alone gives a blank screen on an ESP32.

  ── Installing ────────────────────────────────────────────────
  Copy this over the library's own copy:

    <Arduino>/libraries/TFT_eSPI/User_Setup.h

  It lives in the repo as well so the wiring is version-controlled — a library
  update silently reverts the installed copy, and a blank screen months later
  is very hard to connect back to that.

  ── Wiring (module label -> ESP32) ────────────────────────────
      VCC   -> 3V3        ← not 5V unless the module has an AMS1117
      GND   -> GND
      SCK   -> 18
      SDA   -> 23         ← SPI MOSI, despite the name. NOT GPIO 21.
      CS    -> 5
      A0    -> 4          ← Data/Command. Not an analog pin.
      RESET -> 25
      LED   -> 3V3

  These GPIOs stay clear of the handheld controller's
  buttons (13, 14, 15, 16, 17, 21) and its MPU6050 I2C bus.
*/

#define USER_SETUP_INFO "AgriVerse handheld - ST7735 128x160 on ESP32"

/* ── Panel ────────────────────────────────────────────────── */

#define ST7735_DRIVER

#define TFT_WIDTH  128
#define TFT_HEIGHT 160

/*
  Panel variant. The 1.8" red module is almost always BLACKTAB.

  If the image is shifted by a few pixels or has a white border, swap to
  ST7735_GREENTAB. If the colours are inverted, ST7735_REDTAB. Only one of
  these may be defined at a time.
*/
#define ST7735_BLACKTAB
// #define ST7735_GREENTAB
// #define ST7735_REDTAB
// #define ST7735_GREENTAB160x80

/*
  Some batches wire the panel BGR rather than RGB, which shows as red and blue
  swapped while everything else looks right. Uncomment if that happens.
*/
// #define TFT_RGB_ORDER TFT_BGR

/* ── Pins (ESP32, hardware VSPI) ──────────────────────────── */

/*
  Chosen around the handheld's six buttons, which take 13, 14, 15, 16, 17
  and 21. That rules out a lot of the usual choices — 13 especially, which is
  where A0 sat until this revision.

  Also avoided:
    2, 12    boot strapping pins. 12 can stop the board booting outright if
             anything holds it high at reset.
    16, 17   wired to PSRAM on ESP32-WROVER modules.
    19       VSPI's MISO. Unused here, but not worth the risk.

  Leaves 22 and 27 for the MPU6050's I2C bus, which nothing here touches.
*/
#define TFT_MOSI 23   // module pin "SDA"
#define TFT_SCLK 18   // module pin "SCK"
#define TFT_CS    5
#define TFT_DC    4   // module pin "A0"
#define TFT_RST  25   // module pin "RESET"

// The panel is write-only, so there is no MISO to declare. Leaving it
// undefined keeps the pin free for something else.

// Backlight is wired straight to 3V3. To dim it, put LED on a spare GPIO and
// declare it here instead.
// #define TFT_BL   13
// #define TFT_BACKLIGHT_ON HIGH

/* ── Fonts ────────────────────────────────────────────────── */

#define LOAD_GLCD    // 8px classic font
#define LOAD_FONT2   // 16px
#define LOAD_FONT4   // 26px
#define LOAD_FONT6   // 48px, digits and a few symbols only
#define LOAD_FONT7   // 7-segment, digits only
#define LOAD_FONT8   // 75px, digits only
#define LOAD_GFXFF   // FreeFonts
#define SMOOTH_FONT

/* ── SPI ──────────────────────────────────────────────────── */

/*
  27MHz is the usual safe ceiling for an ST7735 on flying dupont leads. 40MHz
  works on short, tidy wiring; if the display shows noise or occasional
  corrupt lines, drop this to 20000000 before suspecting anything else.
*/
/*
  Deliberately slow while bringing the display up.

  27MHz is fine on a tidy board but marginal on flying dupont leads, and a
  marginal clock corrupts the init sequence — which shows as a blank white
  panel, indistinguishable from a wiring fault. 10MHz is well within what any
  ST7735 manages on breadboard wiring. Raise it once the picture is stable.
*/
#define SPI_FREQUENCY        4000000
#define SPI_READ_FREQUENCY   4000000

/*
  AgriVerse Rover — raw ST7735 test, no display library

  The last resort when a panel stays white. TFT_eSPI is not used, User_Setup.h
  is not read, and no driver is auto-selected — this talks to the controller
  directly with SPI and a hand-written init sequence.

  That makes the result unambiguous:

    Colours appear   the panel, the wiring and the ESP32 are all fine, and the
                     fault was the library's configuration.
    Still white      the panel never accepts an init. Either it is not an
                     ST7735 (try ILI9163 below) or the module is faulty.

  ── Wiring ────────────────────────────────────────────────────
      VCC   -> 3V3       GND -> GND       LED -> 3V3
      SCK   -> 18        SDA -> 23
      CS    -> 5         A0  -> 4         RESET -> 25

  Serial monitor at 115200 — every step is announced before it runs.
*/

#include <SPI.h>

#define PIN_SCK   18
#define PIN_MOSI  23
#define PIN_CS     5
#define PIN_DC     4
#define PIN_RST   25

/*
  Swept rather than fixed.

  A display that works on direct wiring and fails on a breadboard is almost
  always a clock-integrity problem: contact resistance and stray capacitance
  round off the SPI edges until the init sequence arrives corrupt, and a
  corrupt init leaves the panel in its power-on white. Nothing about that looks
  different from a wiring fault.

  So this re-initialises at each speed and announces it. The fastest one that
  produces a clean picture is the ceiling for your wiring — put that in
  User_Setup.h and stop guessing.
*/
const uint32_t SPI_SPEEDS[] = { 20000000, 10000000, 4000000, 2000000, 1000000 };
const int SPEED_COUNT = sizeof(SPI_SPEEDS) / sizeof(SPI_SPEEDS[0]);

uint32_t spiHz = SPI_SPEEDS[0];

const int16_t W = 128;
const int16_t H = 160;

/*
  Column and row offsets.

  The ST7735 die is 132x162 and panels expose a window into it, so the origin
  differs per variant. BLACKTAB starts at 0,0; GREENTAB is inset by 2,1. Wrong
  offsets show as a shifted image with a coloured edge — not as a white screen,
  so leave these alone until something appears.
*/
const int16_t X_OFFSET = 0;
const int16_t Y_OFFSET = 0;

/** Re-applied whenever the speed changes, since SPISettings is by value. */
void useSpeed(uint32_t hz) {
  spiHz = hz;
  SPI.endTransaction();
  SPI.beginTransaction(SPISettings(hz, MSBFIRST, SPI_MODE0));
}

void writeCommand(uint8_t cmd) {
  digitalWrite(PIN_DC, LOW);      // LOW = command
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(cmd);
  digitalWrite(PIN_CS, HIGH);
}

void writeData(uint8_t data) {
  digitalWrite(PIN_DC, HIGH);     // HIGH = data
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(data);
  digitalWrite(PIN_CS, HIGH);
}

/** Hardware reset. The datasheet wants 10us low; 20ms is generous and free. */
void hardReset() {
  digitalWrite(PIN_RST, HIGH);
  delay(50);
  digitalWrite(PIN_RST, LOW);
  delay(20);
  digitalWrite(PIN_RST, HIGH);
  delay(150);
}

/**
 * The shortest init that produces a picture.
 *
 * Deliberately minimal — no gamma tables, no frame-rate tuning, none of the
 * twenty-odd registers a full driver sets. Every command here is one the panel
 * cannot display without, so if this is not enough, more registers will not
 * help.
 */
void initPanel() {
  Serial.println("  SWRESET");
  writeCommand(0x01);             // software reset
  delay(150);

  Serial.println("  SLPOUT");
  writeCommand(0x11);             // out of sleep
  delay(255);

  Serial.println("  COLMOD = 16-bit");
  writeCommand(0x3A);
  writeData(0x05);                // 16 bits per pixel, RGB565
  delay(10);

  Serial.println("  MADCTL");
  writeCommand(0x36);
  writeData(0x00);                // no mirroring, RGB order

  Serial.println("  DISPON");
  writeCommand(0x29);             // display on
  delay(100);
  Serial.flush();
}

/** Set the rectangle that subsequent pixel writes fill. */
void setWindow(int16_t x0, int16_t y0, int16_t x1, int16_t y1) {
  x0 += X_OFFSET; x1 += X_OFFSET;
  y0 += Y_OFFSET; y1 += Y_OFFSET;

  writeCommand(0x2A);             // column address
  writeData(x0 >> 8); writeData(x0 & 0xFF);
  writeData(x1 >> 8); writeData(x1 & 0xFF);

  writeCommand(0x2B);             // row address
  writeData(y0 >> 8); writeData(y0 & 0xFF);
  writeData(y1 >> 8); writeData(y1 & 0xFF);

  writeCommand(0x2C);             // write to RAM
}

void fillScreen(uint16_t colour) {
  setWindow(0, 0, W - 1, H - 1);

  const uint8_t hi = colour >> 8;
  const uint8_t lo = colour & 0xFF;

  // CS held low for the whole frame rather than toggled per byte — 20480
  // transactions would take far longer than the pixels themselves.
  digitalWrite(PIN_DC, HIGH);
  digitalWrite(PIN_CS, LOW);
  for (int32_t i = 0; i < (int32_t)W * H; i++) {
    SPI.transfer(hi);
    SPI.transfer(lo);
  }
  digitalWrite(PIN_CS, HIGH);
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\n[boot] raw ST7735 test — no display library");
  Serial.printf("[pins] SCK=%d MOSI=%d CS=%d DC=%d RST=%d\n",
                PIN_SCK, PIN_MOSI, PIN_CS, PIN_DC, PIN_RST);
  Serial.println("[note] sweeping SPI speeds — note the FASTEST that looks clean");
  Serial.flush();

  pinMode(PIN_CS, OUTPUT);
  pinMode(PIN_DC, OUTPUT);
  pinMode(PIN_RST, OUTPUT);
  digitalWrite(PIN_CS, HIGH);

  // MISO is -1: the panel is write-only, and claiming a MISO pin here would
  // tie up a GPIO for nothing.
  SPI.begin(PIN_SCK, -1, PIN_MOSI, -1);
  SPI.beginTransaction(SPISettings(spiHz, MSBFIRST, SPI_MODE0));
}

void loop() {
  for (int s = 0; s < SPEED_COUNT; s++) {
    const uint32_t hz = SPI_SPEEDS[s];

    Serial.printf("\n=== %lu Hz (%lu MHz) ===\n",
                  (unsigned long)hz, (unsigned long)(hz / 1000000));
    Serial.flush();

    // Reset and re-init at each speed. The init is the fragile part — a clock
    // too fast for the wiring corrupts it, and once corrupted the panel stays
    // white no matter how slowly the pixels are sent afterwards.
    useSpeed(hz);
    hardReset();
    initPanel();

    // Red then blue, so a half-working link that shows one colour but not the
    // other is still obvious.
    fillScreen(0xF800);
    Serial.println("  RED   — is the whole screen red?");
    Serial.flush();
    delay(1500);

    fillScreen(0x001F);
    Serial.println("  BLUE  — is the whole screen blue?");
    Serial.flush();
    delay(1500);
  }

  Serial.println("\n[sweep complete] repeating — the fastest clean speed is your ceiling");
  delay(2000);
}

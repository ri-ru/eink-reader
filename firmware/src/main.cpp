// reTerminal E1002 article reader.
// On every button press: wake, fetch manifest.json + the needed page from BASE_URL over WiFi
// (cached on the built-in microSD so it works offline afterwards), draw it, save bookmark, deep-sleep.
// Page format: 800x480 packed 1-bit, MSB first, 1 = black (what server/render.py emits).
//
// Buttons (E1001/E1002):  GPIO3 = prev page   GPIO4 = next page   GPIO5 = next article

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <FS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"
#include "driver.h"
#include "TFT_eSPI.h"
#include "driver/rtc_io.h"

// ---- pins ----
#define PIN_BTN_PREV   3
#define PIN_BTN_NEXT   4
#define PIN_BTN_ART    5
#define PIN_SD_SCK     7
#define PIN_SD_MISO    8
#define PIN_SD_MOSI    9
#define PIN_SD_CS     14
#define PIN_SD_EN     16   // power enable for SD + panel rail

static const int W = 800, H = 480;
static const size_t PAGE_BYTES = (size_t)W * H / 8;  // 48000

EPaper epaper;
SPIClass sdSPI(HSPI);
Preferences prefs;

struct Article { String slug; String title; int pages; };
#include <vector>
std::vector<Article> lib;

static uint8_t* pageBuf;
static bool online = false;

// ---------- network ----------
static bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  online = WiFi.status() == WL_CONNECTED;
  Serial.printf("wifi %s\n", online ? "ok" : "failed, using SD cache");
  return online;
}

// GET BASE_URL + path, write to SD at the same path. Returns true on success.
static bool download(const char* path) {
  if (!online) return false;
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String(BASE_URL) + path);
  int code = http.GET();
  if (code != 200) { Serial.printf("GET %s -> %d\n", path, code); http.end(); return false; }
  // ensure every parent directory exists
  String p(path);
  for (int i = 1; (i = p.indexOf('/', i)) > 0; i++) SD.mkdir(p.substring(0, i));
  File f = SD.open(path, FILE_WRITE);
  if (!f) { http.end(); return false; }
  http.writeToStream(&f);
  f.close(); http.end();
  return true;
}

// ---------- helpers ----------
static bool loadManifest() {
  download("/manifest.json");                  // refresh if online; otherwise use cached
  File f = SD.open("/manifest.json");
  if (!f) { Serial.println("no manifest.json"); return false; }
  JsonDocument doc;
  if (deserializeJson(doc, f)) { Serial.println("bad manifest"); f.close(); return false; }
  f.close();
  lib.clear();
  for (JsonObject o : doc.as<JsonArray>())
    lib.push_back({o["slug"].as<String>(), o["title"].as<String>(), o["pages"].as<int>()});
  return !lib.empty();
}

static bool loadPage(const Article& a, int page) {
  char path[96];
  snprintf(path, sizeof(path), "/articles/%s/page_%03d.bin", a.slug.c_str(), page);
  if (!SD.exists(path) && !download(path)) { Serial.printf("missing %s\n", path); return false; }
  File f = SD.open(path);
  if (!f) return false;
  size_t n = f.read(pageBuf, PAGE_BYTES);
  f.close();
  return n == PAGE_BYTES;
}

static void showMessage(const char* msg) {
  epaper.fillScreen(TFT_WHITE);
  epaper.setTextColor(TFT_BLACK);
  epaper.setTextSize(2);
  epaper.setCursor(30, 30);
  epaper.println(msg);
  epaper.update();
}

static void showPage() {
  epaper.fillScreen(TFT_WHITE);
  epaper.drawBitmap(0, 0, pageBuf, W, H, TFT_BLACK);
  epaper.update();   // ~25-30 s on the colour panel
}

static void sleepUntilButton() {
  const uint64_t mask = (1ULL << PIN_BTN_PREV) | (1ULL << PIN_BTN_NEXT) | (1ULL << PIN_BTN_ART);
  esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_LOW);
  for (int p : {PIN_BTN_PREV, PIN_BTN_NEXT, PIN_BTN_ART}) {
    rtc_gpio_pullup_en((gpio_num_t)p);
    rtc_gpio_pulldown_dis((gpio_num_t)p);
  }
  digitalWrite(PIN_SD_EN, LOW);
  Serial.println("sleeping");
  Serial.flush();
  esp_deep_sleep_start();
}

// ---------- main ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_SD_EN, OUTPUT); digitalWrite(PIN_SD_EN, HIGH);
  pinMode(PIN_BTN_PREV, INPUT_PULLUP);
  pinMode(PIN_BTN_NEXT, INPUT_PULLUP);
  pinMode(PIN_BTN_ART,  INPUT_PULLUP);
  delay(50);

  pageBuf = (uint8_t*)ps_malloc(PAGE_BYTES);

  // which button woke us (0 on cold boot)
  uint64_t wake = (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT1)
                    ? esp_sleep_get_ext1_wakeup_status() : 0;

  epaper.begin();

  sdSPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  if (!SD.begin(PIN_SD_CS, sdSPI)) { showMessage("No SD card"); sleepUntilButton(); }
  connectWifi();
  if (!loadManifest())              { showMessage("No articles yet.\nAdd a URL to queue.txt"); sleepUntilButton(); }

  prefs.begin("reader", false);
  int art  = prefs.getInt("art", 0);
  int page = prefs.getInt("page", 1);
  if (art >= (int)lib.size()) { art = 0; page = 1; }

  if (wake & (1ULL << PIN_BTN_NEXT))      { if (page < lib[art].pages) page++; }
  else if (wake & (1ULL << PIN_BTN_PREV)) { if (page > 1) page--; }
  else if (wake & (1ULL << PIN_BTN_ART))  {
    prefs.putInt(("bm_" + String(art)).c_str(), page);   // remember where we were
    art = (art + 1) % lib.size();
    page = prefs.getInt(("bm_" + String(art)).c_str(), 1);
  }
  prefs.putInt("art", art);
  prefs.putInt("page", page);

  Serial.printf("%s  page %d/%d\n", lib[art].title.c_str(), page, lib[art].pages);
  if (loadPage(lib[art], page)) showPage();
  else showMessage(online ? "Page file missing" : "Offline and page not cached");

  // prefetch the next page while the panel is still refreshing, so the next turn is instant
  if (online && page < lib[art].pages) {
    char nxt[96];
    snprintf(nxt, sizeof(nxt), "/articles/%s/page_%03d.bin", lib[art].slug.c_str(), page + 1);
    if (!SD.exists(nxt)) download(nxt);
  }
  WiFi.disconnect(true);

  sleepUntilButton();
}

void loop() {}

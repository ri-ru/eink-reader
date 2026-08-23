# eink-reader (reTerminal E1002)

Send a URL, read it on the E1002. GitHub renders the pages, the device pulls them over WiFi and caches
them on its own microSD. Your Mac never has to be on, and you never touch the SD card.

## Setup (once)

1. Push this folder to a **public** GitHub repo called `eink-reader` (Actions run for free).
   In the repo: Settings > Actions > General > Workflow permissions > "Read and write".
2. `firmware/include/secrets.h`: fill in WiFi + `BASE_URL` (`https://raw.githubusercontent.com/<you>/eink-reader/main/site`).
3. Flash: install the PlatformIO extension in VS Code, open `firmware/`, plug the E1002 in over USB-C, click Upload.
   (Or `pip install platformio && cd firmware && pio run -t upload`.)
4. Put the microSD card in the E1002.

## Sending an article

Add a line to `queue.txt` and push (GitHub app on your phone works). ~1 min later the pages are rendered.
PDFs: drop the file in `pdfs/` and add `pdfs/name.pdf` to `queue.txt`.
Press any button on the device; it fetches the new manifest.

## Buttons

GPIO3 = previous page · GPIO4 = next page · GPIO5 = next article. Bookmarks persist.
Each page turn is a full refresh (~25 s on the colour panel).

## Local testing of the renderer

    cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python render.py http://www.paulgraham.com/greatwork.html --out out
    open out/articles/*/preview_001.png

Note: LessWrong returns Cloudflare 403 to scripts from this Mac. The GitHub runner is a different IP and
will most likely pass; if it doesn't, save the post as .html in the browser, commit it under `pdfs/`, and queue that path.

## If something is off
- Wrong button does the wrong thing: swap the `PIN_BTN_*` defines in `firmware/src/main.cpp` (keys are GPIO3/4/5).
- Text too small/large: `--size 17` / `--size 21` in the workflow's render line.
- Figure-heavy PDF: add `--raster` for that entry (edit the render line in the workflow or run locally).

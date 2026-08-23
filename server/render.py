#!/usr/bin/env python3
"""
Turn a URL or PDF into pre-paginated 800x480 1-bit pages for the reTerminal E1002.

Usage:
  python render.py https://www.lesswrong.com/posts/...   --out /Volumes/SDCARD
  python render.py paper.pdf --out /Volumes/SDCARD
  python render.py saved_page.html --out /Volumes/SDCARD   # for sites that block scripts (LessWrong): Cmd+S in the browser
  python render.py paper.pdf --out ./out --raster    # figure-heavy PDF: rasterise pages instead of reflowing

Output layout (what the firmware reads):
  <out>/articles/<slug>/page_001.bin ... page_NNN.bin   (packed 1-bit, MSB first, 48000 bytes)
  <out>/articles/<slug>/preview_001.png                  (same image, for you to sanity check)
  <out>/manifest.json                                    ([{"slug","title","pages"}, ...])
"""
import argparse, json, re, sys, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

W, H = 800, 480
MARGIN = 28
FOOTER_H = 26
LINE_H = 1.35

def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Charter.ttc",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/Library/Fonts/Literata-Regular.ttf",
        "/usr/share/fonts/truetype/crosextra/Caladea-Regular.ttf",   # GitHub runner
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    ]
    for c in candidates:
        p = Path(c)
        if p.exists():
            if bold and p.name.endswith("-Regular.ttf") and p.with_name(p.name.replace("Regular", "Bold")).exists():
                p = p.with_name(p.name.replace("Regular", "Bold"))
            try:
                return ImageFont.truetype(str(p), size, index=1 if (bold and p.suffix == ".ttc") else 0)
            except OSError:
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()

# ---------- extraction ----------

def slugify(s):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:48] or "article"

def extract_html(html, fallback_title):
    import trafilatura
    md = trafilatura.extract(html, output_format="markdown", include_links=False,
                             include_images=False, include_formatting=True)
    meta = trafilatura.extract_metadata(html)
    title = (meta.title if meta and meta.title else fallback_title)
    author = meta.author if meta and meta.author else ""
    return title, author, md or ""

LW_HOSTS = ("lesswrong.com", "alignmentforum.org", "greaterwrong.com")

def extract_lw(url):
    """LessWrong / Alignment Forum via their GraphQL API: clean body, no comments, real title."""
    import requests
    m = re.search(r"/posts/([A-Za-z0-9]+)", url)
    if not m:
        return None
    host = "www.alignmentforum.org" if "alignmentforum" in url else "www.lesswrong.com"
    q = '{ post(input:{selector:{_id:"%s"}}) { result { title user { displayName } htmlBody } } }' % m.group(1)
    for attempt in range(4):
        try:
            r = requests.post(f"https://{host}/graphql", json={"query": q}, timeout=30,
                              headers={"User-Agent": "eink-reader/1.0 (personal e-reader)", "Content-Type": "application/json"})
            if r.ok:
                d = r.json()["data"]["post"]["result"]
                body = re.sub(r"<sup[^>]*>\s*\[?(\d+)\]?\s*</sup>", r" [\1]", d["htmlBody"])
                html = f"<html><head><title>{d['title']}</title></head><body><article>{body}</article></body></html>"
                t, _, md = extract_html(html, d["title"])
                return d["title"], (d.get("user") or {}).get("displayName", ""), md
            print(f"graphql {r.status_code}, retrying", file=sys.stderr)
        except (requests.RequestException, KeyError, TypeError, ValueError) as e:
            print(f"graphql error {e}, retrying", file=sys.stderr)
        import time; time.sleep(5 * (attempt + 1))
    return None

def extract_url(url):
    import requests
    if any(h in url for h in LW_HOSTS):
        got = extract_lw(url)
        if got:
            return got
    ua = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
    html = None
    for u in (url, url.replace("www.lesswrong.com", "www.greaterwrong.com")):
        try:
            r = requests.get(u, headers=ua, timeout=30)
            if r.ok and len(r.text) > 2000:
                html = r.text; break
        except requests.RequestException:
            pass
    if not html:
        sys.exit(f"could not fetch {url} (Cloudflare 403? save the page as .html in the browser and pass that instead)")
    return extract_html(html, url)

def extract_pdf(path):
    import fitz  # pymupdf
    doc = fitz.open(path)
    title = doc.metadata.get("title") or Path(path).stem
    author = doc.metadata.get("author") or ""
    blocks = []
    for page in doc:
        for b in page.get_text("blocks"):
            t = b[4].strip()
            if t:
                blocks.append(re.sub(r"-\n", "", t).replace("\n", " "))
    return title, author, "\n\n".join(blocks)

def raster_pdf(path):
    import fitz
    doc = fitz.open(path)
    for page in doc:
        # fit page into W x H, landscape
        r = page.rect
        zoom = min(W / r.width, H / r.height)
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY)
        im = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        canvas = Image.new("L", (W, H), 255)
        canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
        yield canvas.convert("1", dither=Image.FLOYDSTEINBERG)

# ---------- layout ----------

def markdown_to_blocks(md):
    """Very small markdown → list of (kind, text). kind in h1,h2,p,quote,li."""
    out = []
    for raw in md.split("\n"):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("# "):
            out.append(("h1", line[2:]))
        elif line.startswith("## ") or line.startswith("### "):
            out.append(("h2", line.lstrip("#").strip()))
        elif line.startswith(">"):
            out.append(("quote", line.lstrip("> ").strip()))
        elif re.match(r"^\s*([-*]|\d+\.)\s+", line):
            out.append(("li", re.sub(r"^\s*([-*]|\d+\.)\s+", "• ", line)))
        else:
            # strip residual markdown emphasis
            out.append(("p", re.sub(r"[*_`]+", "", line)))
    return out

def paginate(title, author, blocks, base=19):
    body = load_font(base)
    bold = load_font(base, bold=True)
    h1 = load_font(int(base * 1.6), bold=True)
    h2 = load_font(int(base * 1.25), bold=True)
    small = load_font(13)

    text_w = W - 2 * MARGIN
    draw = ImageDraw.Draw(Image.new("1", (1, 1)))

    def wrap(text, font, width):
        words, lines, cur = text.split(), [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if draw.textlength(trial, font=font) <= width:
                cur = trial
            else:
                if cur: lines.append(cur)
                cur = w
        if cur: lines.append(cur)
        return lines

    # flatten into drawable lines: (font, text, indent, gap_after)
    lines = []
    lines += [(h1, l, 0, 0) for l in wrap(title, h1, text_w)]
    if author:
        lines.append((small, author, 0, 0))
    lines.append((body, "", 0, 0))
    for kind, text in blocks:
        if kind == "h1":
            lines.append((body, "", 0, 0))
            lines += [(h1, l, 0, 0) for l in wrap(text, h1, text_w)]
        elif kind == "h2":
            lines.append((body, "", 0, 0))
            lines += [(h2, l, 0, 0) for l in wrap(text, h2, text_w)]
        elif kind == "quote":
            lines += [(body, l, 24, 0) for l in wrap(text, body, text_w - 24)]
        elif kind == "li":
            lines += [(body, l, 12, 0) for l in wrap(text, body, text_w - 12)]
        else:
            lines += [(body, l, 0, 0) for l in wrap(text, body, text_w)]
        lines.append((body, "", 0, 0))  # paragraph gap

    # pour lines into pages
    pages, cur, y = [], [], MARGIN
    max_y = H - FOOTER_H - MARGIN // 2
    for font, text, indent, _ in lines:
        lh = int(font.size * LINE_H) if text else int(body.size * 0.6)
        if y + lh > max_y:
            pages.append(cur); cur, y = [], MARGIN
            if not text:
                continue  # don't start a page with a blank
        cur.append((font, text, indent, y))
        y += lh
    if cur: pages.append(cur)

    total = len(pages)
    for i, page in enumerate(pages, 1):
        im = Image.new("1", (W, H), 1)
        d = ImageDraw.Draw(im)
        for font, text, indent, y in page:
            if text:
                d.text((MARGIN + indent, y), text, font=font, fill=0)
        foot = f"{title[:70]}   ·   {i} / {total}"
        d.line([(MARGIN, H - FOOTER_H), (W - MARGIN, H - FOOTER_H)], fill=0)
        d.text((MARGIN, H - FOOTER_H + 5), foot, font=small, fill=0)
        yield im

# ---------- output ----------

def to_packed(im):
    """1-bit packed, MSB first, 1 = black (matches TFT_eSPI drawBitmap with color=BLACK)."""
    inv = ImageOps.invert(im.convert("L")).convert("1")
    return inv.tobytes()  # PIL packs mode '1' rows MSB-first, padded to byte boundary (800 is byte aligned)

def write_article(out, slug, title, pages, preview=True):
    d = out / "articles" / slug
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob("*"):
        old.unlink()
    n = 0
    for n, im in enumerate(pages, 1):
        (d / f"page_{n:03d}.bin").write_bytes(to_packed(im))
        if preview: im.save(d / f"preview_{n:03d}.png")
    mpath = out / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else []
    manifest = [m for m in manifest if m["slug"] != slug and (out / "articles" / m["slug"]).is_dir()]
    manifest.append({"slug": slug, "title": title[:80], "pages": n})
    mpath.write_text(json.dumps(manifest, indent=1))
    print(f"{slug}: {n} pages → {d}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="URL or path to PDF")
    ap.add_argument("--out", default="./out", help="SD card root (folder containing manifest.json)")
    ap.add_argument("--raster", action="store_true", help="PDF: rasterise pages instead of reflowing text")
    ap.add_argument("--size", type=int, default=19, help="body font px (19 ≈ 380 words/page)")
    ap.add_argument("--no-preview", action="store_true")
    a = ap.parse_args()
    out = Path(a.out)

    if a.source.lower().endswith(".pdf"):
        if a.raster:
            title = Path(a.source).stem
            write_article(out, slugify(title), title, raster_pdf(a.source), not a.no_preview)
            return
        title, author, text = extract_pdf(a.source)
        blocks = [("p", p) for p in text.split("\n\n") if p.strip()]
    elif not a.source.startswith("http") and a.source.lower().endswith((".html", ".htm")):
        title, author, md = extract_html(Path(a.source).read_text(errors="ignore"), Path(a.source).stem)
        blocks = markdown_to_blocks(md)
    else:
        title, author, md = extract_url(a.source)
        blocks = markdown_to_blocks(md)

    write_article(out, slugify(title), title, paginate(title, author, blocks, a.size), not a.no_preview)

if __name__ == "__main__":
    main()

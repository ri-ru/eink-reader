// ==UserScript==
// @name         Substack Pages
// @namespace    https://github.com/ri-ru/eink-reader
// @version      1.0.0
// @description  Open a Substack post and read real pages with e-ink page-turn buttons.
// @match        https://*.substack.com/*
// @match        https://substack.com/*
// @match        https://*/p/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ri-ru/eink-reader/refs/heads/feat/substack-pages/browser/substack-pages.user.js
// @downloadURL  https://raw.githubusercontent.com/ri-ru/eink-reader/refs/heads/feat/substack-pages/browser/substack-pages.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.top !== window || window.__substackPages) return;

  const HOST_ID = 'substack-pages-host';
  const GAP = 32;
  let host, shadow, viewport, flow, counter, previousButton, nextButton;
  let active = false, page = 0, pages = 1, width = 1, fontSize = 22;
  let source = null, sourceSignature = '', articleUrl = '', dismissedUrl = '';
  let seenUrl = location.origin + location.pathname, staleBody = null, staleSignature = '';
  let originalOverflow = null, layoutFrame = 0, scanTimer = 0;
  let restoreButton = null, restoring = false;
  let savedScroll = { x: 0, y: 0 };
  const originalPageScroll = window.__einkbroPageScroll;
  const originalScrollTop = window.__einkbroScrollToTop;
  const cleanUrl = () => location.origin + location.pathname;
  const storageKey = () => 'substack-pages:position:' + (articleUrl || cleanUrl());
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Reading still works. */ }
  };
  const initialSize = Number(read('substack-pages:font-size', 22));
  if (Number.isFinite(initialSize)) fontSize = Math.max(16, Math.min(36, initialSize));

  const css = `
    :host { all: initial; position: fixed !important; inset: 0 !important; display: block !important;
      z-index: 2147483647 !important; background: white !important; color: black !important;
      width: 100% !important; height: 100% !important; color-scheme: light; }
    * { box-sizing: border-box; animation: none !important; transition: none !important; }
    #reader { height: 100%; display: grid; grid-template-rows: 52px minmax(0,1fr) 64px;
      background: #fff; color: #000; font-family: system-ui, sans-serif; }
    header, footer { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #fff; }
    header { border-bottom: 1px solid #000; }
    footer { border-top: 1px solid #000; padding-bottom: max(6px, env(safe-area-inset-bottom)); }
    #label { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button { appearance: none; background: white; color: black; border: 1px solid black;
      border-radius: 4px; font: 16px system-ui, sans-serif; min-height: 40px; min-width: 44px;
      padding: 6px 10px; cursor: pointer; touch-action: manipulation; }
    button:focus-visible, a:focus-visible { outline: 3px solid black; outline-offset: 2px; }
    button:disabled { color: #666; border-color: #999; cursor: default; }
    footer button { min-height: 46px; flex: 1; }
    #counter { min-width: 84px; text-align: center; font-size: 14px; }
    #viewport { margin: 18px 24px; min-height: 0; overflow: hidden; position: relative; touch-action: pan-y; }
    #flow { font: var(--font-size,22px)/1.5 Georgia, 'Noto Serif', serif; height: 100%; width: 100%;
      column-fill: auto; column-gap: ${GAP}px; color: black; overflow-wrap: anywhere; }
    #flow * { max-width: 100%; color: inherit; background: transparent; }
    h1 { font-size: 1.45em; line-height: 1.18; margin: 0 0 .65em; }
    h2 { font-size: 1.25em; line-height: 1.25; }
    h3,h4,h5,h6 { font-size: 1.1em; line-height: 1.3; }
    h1,h2,h3,h4,h5,h6 { break-after: avoid; }
    p,ul,ol,blockquote,figure,pre,table { margin: 0 0 .85em; }
    p,li { orphans: 2; widows: 2; }
    ul,ol { padding-left: 1.4em; }
    blockquote { margin-left: 0; border-left: 2px solid black; padding-left: .8em; }
    img,svg { display: block; width: auto; height: auto; max-width: 100%;
      max-height: var(--image-height,60vh); object-fit: contain; break-inside: avoid; }
    figure { margin-left: 0; margin-right: 0; }
    figcaption { font-size: .8em; line-height: 1.3; }
    pre,code { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .82em; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: .8em; }
    th,td { border: 1px solid black; padding: .25em; overflow-wrap: anywhere; }
    a { color: black; text-decoration: underline; }
    hr { border: 0; border-top: 1px solid black; margin: 1em 0; }
    .byline,.subtitle { font-size: .9em; margin-bottom: 1em; }
    .end-note { border-top: 1px solid black; padding-top: .75em; font-size: .85em; }
    @media (max-width: 380px) { #viewport { margin: 12px 16px; } header,footer { gap: 5px; padding-left: 8px; padding-right: 8px; } }
    @media (max-height: 450px) { #reader { grid-template-rows: 44px minmax(0,1fr) 52px; } #viewport { margin-top: 8px; margin-bottom: 8px; } }
  `;

  function button(text, label, callback) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = text; el.setAttribute('aria-label', label);
    el.addEventListener('click', callback);
    return el;
  }

  function sanitize(original) {
    const clone = original.cloneNode(true);
    clone.querySelectorAll('script,style,link,meta,form,input,textarea,select,button,noscript,object,embed').forEach(el => el.remove());
    clone.querySelectorAll('iframe,video,audio').forEach(el => {
      const p = document.createElement('p');
      const a = document.createElement('a');
      a.href = articleUrl; a.textContent = 'Open media on Substack'; a.dataset.original = 'true';
      p.append(a); el.replaceWith(p);
    });
    const originals = Array.from(original.querySelectorAll('img'));
    const clonedImages = Array.from(clone.querySelectorAll('img'));
    for (const el of [clone, ...clone.querySelectorAll('*')]) {
      for (const attr of [...el.attributes]) {
        if (!['href','src','alt','title','id','colspan','rowspan','start','dir','data-original'].includes(attr.name)) el.removeAttribute(attr.name);
      }
      if (el.hasAttribute('href')) {
        try {
          const url = new URL(el.getAttribute('href'), location.href);
          if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) el.removeAttribute('href');
          else el.setAttribute('href', url.href);
        } catch (_) { el.removeAttribute('href'); }
      }
      if (el.hasAttribute('src')) {
        try {
          const url = new URL(el.getAttribute('src'), location.href);
          if (!['https:', 'http:'].includes(url.protocol)) el.removeAttribute('src');
          else el.setAttribute('src', url.href);
        } catch (_) { el.removeAttribute('src'); }
      }
    }
    clonedImages.forEach((img, i) => {
      const src = originals[i]?.currentSrc || originals[i]?.src || originals[i]?.dataset.src;
      if (src && /^https?:\/\//i.test(src)) img.src = src;
      img.loading = 'eager'; img.decoding = 'async';
    });
    return clone;
  }

  // Character anchors keep the same passage visible across font changes and rotation.
  function textNodes() {
    const result = [], walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.textContent.length) result.push(walker.currentNode);
    return result;
  }
  function currentAnchor() {
    if (!flow || !active) return 0;
    const left = viewport.getBoundingClientRect().left;
    let offset = 0;
    for (const node of textNodes()) {
      const range = document.createRange(); range.selectNodeContents(node);
      const rects = [...range.getClientRects()];
      if (rects.some(r => r.right > left + 1 && r.left < left + width - 1)) {
        // Binary search the first character on this page within a split paragraph.
        let low = 0, high = node.length;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          range.setStart(node, mid); range.setEnd(node, Math.min(node.length, mid + 1));
          if (range.getBoundingClientRect().right <= left + 1) low = mid + 1;
          else high = mid;
        }
        return offset + low;
      }
      offset += node.length;
    }
    return offset;
  }
  function pageForAnchor(anchor) {
    let offset = 0;
    for (const node of textNodes()) {
      if (offset + node.length > anchor) {
        const range = document.createRange();
        const pos = Math.max(0, anchor - offset);
        range.setStart(node, pos); range.setEnd(node, Math.min(pos + 1, node.length));
        return Math.floor((range.getBoundingClientRect().left - viewport.getBoundingClientRect().left + 1) / (width + GAP));
      }
      offset += node.length;
    }
    return pages - 1;
  }
  function persist() {
    if (active && !restoring) write(storageKey(), { anchor: currentAnchor() });
  }
  function showPage(n, save = true) {
    if (!active) return;
    page = Math.max(0, Math.min(pages - 1, n));
    flow.style.transform = `translateX(${-page * (width + GAP)}px)`;
    counter.textContent = `${page + 1} / ${pages}`;
    counter.setAttribute('aria-label', `Page ${page + 1} of ${pages}`);
    previousButton.disabled = page === 0;
    nextButton.disabled = page === pages - 1;
    if (save) persist();
  }
  function layout(anchor) {
    if (!active) return;
    width = viewport.clientWidth;
    if (!width || !viewport.clientHeight) return;
    flow.style.transform = 'none';
    flow.style.columnWidth = `${width}px`;
    flow.style.setProperty('--font-size', `${fontSize}px`);
    flow.style.setProperty('--image-height', `${Math.max(40, viewport.clientHeight - fontSize * 3)}px`);
    pages = Math.max(1, Math.ceil((flow.scrollWidth + GAP - 1) / (width + GAP)));
    showPage(anchor == null ? page : pageForAnchor(anchor), false);
    persist();
  }
  function relayout() {
    if (!active) return;
    const anchor = read(storageKey(), { anchor: 0 }).anchor;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => layout(anchor));
  }
  function changeSize(delta) {
    const anchor = currentAnchor();
    fontSize = Math.min(36, Math.max(16, fontSize + delta));
    write('substack-pages:font-size', fontSize);
    layout(anchor);
  }
  function makeContent() {
    const fragment = document.createDocumentFragment();
    const title = document.querySelector('h1.post-title, h1');
    if (title && !source.contains(title)) {
      const heading = document.createElement('h1'); heading.textContent = title.textContent; fragment.append(heading);
    }
    const subtitle = document.querySelector('.subtitle');
    if (subtitle && !source.contains(subtitle)) {
      const p = document.createElement('p'); p.className = 'subtitle'; p.textContent = subtitle.textContent; fragment.append(p);
    }
    const content = sanitize(source);
    // A wrapper around all text must not become an indivisible column item.
    fragment.append(...content.childNodes);
    const end = document.createElement('p'); end.className = 'end-note';
    const link = document.createElement('a'); link.href = articleUrl; link.dataset.original = 'true';
    const paywall = document.querySelector('.paywall, .paywall-jump, [data-component-name="Paywall"]');
    link.textContent = paywall ? 'Sign in or subscribe on Substack to continue reading.' : 'Open original for comments, audio, or subscriptions.';
    end.append(link); fragment.append(end);
    return fragment;
  }
  function openReader(body) {
    source = body; articleUrl = cleanUrl(); sourceSignature = body.innerHTML;
    restoreButton?.remove(); restoreButton = null;
    host = document.createElement('div'); host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = css;
    const reader = document.createElement('section'); reader.id = 'reader'; reader.setAttribute('aria-label', 'Paginated article');
    const header = document.createElement('header');
    const label = document.createElement('span'); label.id = 'label'; label.textContent = 'Substack Pages';
    header.append(button('Original', 'Original', () => closeReader(true)), label,
      button('A−', 'Smaller text', () => changeSize(-2)), button('A+', 'Larger text', () => changeSize(2)));
    viewport = document.createElement('main'); viewport.id = 'viewport'; viewport.dataset.pagesViewport = '';
    flow = document.createElement('article'); flow.id = 'flow'; flow.append(makeContent()); viewport.append(flow);
    const footer = document.createElement('footer');
    previousButton = button('← Back', 'Previous page', () => showPage(page - 1));
    nextButton = button('Next →', 'Next page', () => showPage(page + 1));
    counter = document.createElement('span'); counter.id = 'counter'; counter.setAttribute('aria-live', 'polite');
    footer.append(previousButton, counter, nextButton);
    reader.append(header, viewport, footer); shadow.append(style, reader);
    savedScroll = { x: scrollX, y: scrollY };
    originalOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
    document.documentElement.append(host);
    active = true; page = 0;
    const saved = read(storageKey(), { anchor: 0 });
    restoring = true; layout(saved.anchor); restoring = false;
    persist();
    flow.querySelectorAll('img').forEach(img => {
      img.addEventListener('load', relayout); img.addEventListener('error', relayout);
    });
    if (document.fonts) document.fonts.ready.then(relayout);
    shadow.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link) return;
      if (link.dataset.original) { event.preventDefault(); closeReader(true); return; }
      const url = new URL(link.href, location.href);
      if (url.origin + url.pathname === cleanUrl() && url.hash) {
        let id;
        try { id = decodeURIComponent(url.hash.slice(1)); } catch (_) { return; }
        const target = shadow.getElementById(id);
        if (target) {
          event.preventDefault();
          const x = target.getBoundingClientRect().left - viewport.getBoundingClientRect().left + page * (width + GAP);
          showPage(Math.floor((x + 1) / (width + GAP)));
        }
      }
    });
  }
  function closeReader(dismiss = true) {
    if (!active) return;
    persist(); active = false; cancelAnimationFrame(layoutFrame);
    host.remove(); host = null;
    if (originalOverflow) {
      document.documentElement.style.overflow = originalOverflow[0];
      document.body.style.overflow = originalOverflow[1];
    }
    window.scrollTo(savedScroll.x, savedScroll.y);
    if (dismiss) {
      dismissedUrl = cleanUrl();
      restoreButton = button('Pages', 'Pages', () => { dismissedUrl = ''; scan(); });
      restoreButton.style.cssText = 'position:fixed!important;bottom:20px!important;right:16px!important;z-index:2147483647!important;background:#fff!important;color:#000!important;border:2px solid #000!important;border-radius:4px!important;padding:12px 20px!important;font:18px system-ui!important;';
      document.documentElement.append(restoreButton);
    }
  }
  function scan() {
    const url = cleanUrl();
    if (seenUrl !== url) {
      staleBody = source; staleSignature = sourceSignature; seenUrl = url;
      closeReader(false); dismissedUrl = ''; source = null; sourceSignature = '';
      restoreButton?.remove(); restoreButton = null;
    }
    if (dismissedUrl === url) return;
    // Substack uses this article-specific DOM on both subdomains and custom domains.
    // Do not turn home feeds, authentication pages, or unrelated /p/ pages into books.
    const body = document.querySelector('.body.markup');
    if (!body || body.textContent.trim().length < 40 || !(/\/p\//.test(location.pathname) || /\/home\/post\//.test(location.pathname))) {
      if (active && (!source?.isConnected || articleUrl !== url)) closeReader(false);
      return;
    }
    // React may update the URL before replacing the previous post's DOM.
    if (body === staleBody && body.innerHTML === staleSignature) return;
    staleBody = null; staleSignature = '';
    if (active) {
      if (body !== source || body.innerHTML !== sourceSignature) {
        const anchor = currentAnchor();
        source = body; sourceSignature = body.innerHTML;
        flow.replaceChildren(makeContent());
        flow.querySelectorAll('img').forEach(img => { img.addEventListener('load', relayout); img.addEventListener('error', relayout); });
        layout(anchor);
      }
      return;
    }
    openReader(body);
  }
  function scheduleScan() {
    clearTimeout(scanTimer); scanTimer = setTimeout(scan, 250);
  }

  window.__substackPages = {
    next: () => showPage(page + 1), previous: () => showPage(page - 1),
    close: () => closeReader(true), refresh: scan,
    getState: () => ({ active, page, pages, fontSize })
  };
  window.__einkbroPageScroll = function(direction, ...args) {
    if (active) {
      showPage(page + (direction === 'up' || direction === -1 ? -1 : 1));
      return true;
    }
    return typeof originalPageScroll === 'function' ? originalPageScroll.call(this, direction, ...args) : false;
  };
  window.__einkbroScrollToTop = function(...args) {
    if (active) { showPage(0); return true; }
    return typeof originalScrollTop === 'function' ? originalScrollTop.apply(this, args) : false;
  };
  document.addEventListener('keydown', event => {
    if (!active || event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (event.composedPath().some(el => el.tagName === 'BUTTON') && [' ', 'Enter'].includes(event.key)) return;
    if (['PageDown','ArrowRight','ArrowDown',' '].includes(event.key)) {
      event.preventDefault(); showPage(page + (event.shiftKey ? -1 : 1));
    } else if (['PageUp','ArrowLeft','ArrowUp'].includes(event.key)) {
      event.preventDefault(); showPage(page - 1);
    } else if (event.key === 'Home') { event.preventDefault(); showPage(0); }
    else if (event.key === 'End') { event.preventDefault(); showPage(pages - 1); }
    else if (event.key === 'Escape') { event.preventDefault(); closeReader(true); }
  }, true);
  window.addEventListener('resize', relayout);
  window.visualViewport?.addEventListener('resize', relayout);
  window.addEventListener('pagehide', persist);
  window.addEventListener('popstate', scheduleScan);
  for (const method of ['pushState','replaceState']) {
    const original = history[method];
    history[method] = function(...args) { const result = original.apply(this, args); scheduleScan(); return result; };
  }
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fixture, articleBody } from './fixtures.mjs';

const scriptPath = fileURLToPath(new URL('../substack-pages.user.js', import.meta.url));
const state = (page) => page.evaluate(() => window.__substackPages?.getState());
const next = (page) => page.getByRole('button', { name: 'Next page', exact: true }).click();
const previous = (page) => page.getByRole('button', { name: 'Previous page', exact: true }).click();

async function settleImages(page) {
  await page.locator('#substack-pages-host').evaluate(async host => {
    await Promise.all([...host.shadowRoot.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function mount(page, options = {}) {
  const source = await readFile(scriptPath, 'utf8');
  await page.route('https://**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/picture.svg') {
      if (options.imageDelay) await new Promise(resolve => setTimeout(resolve, options.imageDelay));
      await route.fulfill({ contentType: 'image/svg+xml', body: options.tallImage
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="3600"><rect width="900" height="3600" fill="white"/><path d="M0 3600L450 0L900 3600Z" fill="black"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1400"><rect width="1800" height="1400" fill="white"/><path d="M0 1400L900 100L1800 1400Z" fill="black"/></svg>' });
      return;
    }
    if (url.pathname === '/embed') {
      await route.fulfill({ contentType: 'text/html', body: '<p>An embedded widget</p>' });
      return;
    }
    let html = fixture({ ...options, label: url.pathname.split('/').pop() || 'first' });
    if (options.tallImage) html = html.replace(/<figcaption>.*?<\/figcaption>/g, '').replace('<h2>Pictures and captions</h2>', '');
    if (options.pictureOnly) html = html.replace(/<div class="body markup" dir="auto">[\s\S]*?<\/div>/, '<div class="body markup"><figure><img src="https://test.substack.com/picture.svg" alt="A picture-only post"></figure></div>');
    await route.fulfill({ contentType: 'text/html', body: html.replace('<!-- USER_SCRIPT -->', `<script>${source.replaceAll('</script', '<\\/script')}</script>`) });
  });
  await page.goto(`https://${options.customHome ? 'newsletter.example' : 'test.substack.com'}/${options.unrelated ? 'about' : options.customHome ? '' : 'p/first'}`);
  if (!options.unrelated && !options.customHome) {
    await expect(page.locator('#substack-pages-host')).toBeVisible();
    await expect.poll(async () => (await state(page))?.pages).toBeGreaterThan(1);
  }
}

test('opens automatically; buttons and keyboard turn complete pages and stop at boundaries', async ({ page }, testInfo) => {
  await mount(page);
  const initial = await state(page);
  expect(initial.active).toBe(true);
  await expect(page.locator('#substack-pages-host').locator('#flow h1').first()).toHaveText('A quiet page: first');
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('phone-first-page.png') });
  await next(page);
  await expect.poll(async () => (await state(page)).page).toBe(initial.page + 1);
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await state(page)).page).toBe(initial.page + 2);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await state(page)).page).toBe(initial.page + 1);
  await previous(page);
  expect((await state(page)).page).toBe(initial.page);
  for (let i = 1; i < initial.pages; i++) await next(page);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('phone-final-page.png') });
  const before = await state(page);
  await page.keyboard.press('PageDown');
  expect((await state(page)).page).toBe(before.page);
});

test('native EinkBro bridge turns pages and delegates after Original', async ({ page }) => {
  await mount(page);
  const first = await state(page);
  expect(await page.evaluate(() => window.__einkbroPageScroll('down', 0, 0))).toBe(true);
  expect((await state(page)).page).toBe(first.page + 1);
  expect(await page.evaluate(() => window.__einkbroPageScroll('up', 0, 0))).toBe(true);
  expect((await state(page)).page).toBe(first.page);
  expect(await page.evaluate(() => window.__einkbroPageScroll(1, 50, 80))).toBe(true);
  expect((await state(page)).page).toBe(first.page + 1);
  expect(await page.evaluate(() => window.__einkbroPageScroll(-1, 50, 80))).toBe(true);
  expect((await state(page)).page).toBe(first.page);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('#substack-pages-host')).not.toBeVisible();
  await page.evaluate(() => window.__einkbroPageScroll('down', 0, 0));
  expect(await page.evaluate(() => window.originalBridgeCalls)).toEqual([['down', 0, 0]]);
  await expect(page.getByRole('button', { name: 'Pages', exact: true })).toBeVisible();
  // A background website mutation must not undo the user's explicit exit.
  await page.evaluate(() => document.querySelector('.body.markup').append(' Hydration finished.'));
  await page.waitForTimeout(600);
  await expect(page.locator('#substack-pages-host')).not.toBeVisible();
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(page.locator('#substack-pages-host')).toBeVisible();
});

test('delayed content is paginated without another action', async ({ page }) => {
  await mount(page, { delayed: true });
  expect((await state(page)).active).toBe(true);
});

test('does not alter unrelated pages', async ({ page }) => {
  await mount(page, { unrelated: true });
  await page.waitForTimeout(700);
  await expect(page.locator('#substack-pages-host')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Not a Substack article' })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
});

test('remembers progress after reload', async ({ page }) => {
  await mount(page);
  for (let i = 0; i < 4; i++) await next(page);
  const before = await state(page);
  await page.reload();
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  await expect.poll(async () => (await state(page))?.page).toBe(before.page);
});

test('font controls reflow, preserve place, and remain readable after rotation', async ({ page }, testInfo) => {
  await mount(page);
  for (let i = 0; i < 6; i++) await next(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  await expect.poll(async () => (await state(page)).fontSize).toBeGreaterThan(before.fontSize);
  let after = await state(page);
  expect(Math.abs(after.page / after.pages - before.page / before.pages)).toBeLessThan(0.15);
  await page.getByRole('button', { name: 'Smaller text', exact: true }).click();
  await expect.poll(async () => (await state(page)).fontSize).toBe(before.fontSize);
  await page.setViewportSize({ width: 820, height: 412 });
  await page.waitForTimeout(400);
  after = await state(page);
  expect(after.active).toBe(true);
  expect(Math.abs(after.page / after.pages - before.page / before.pages)).toBeLessThan(0.18);
  const host = await page.locator('#substack-pages-host').boundingBox();
  expect(host.x).toBeGreaterThanOrEqual(0);
  expect(host.y).toBeGreaterThanOrEqual(0);
  expect(host.width).toBeLessThanOrEqual(820);
  expect(host.height).toBeLessThanOrEqual(412);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('landscape-large-text.png') });
});

test('client-side navigation enters a new article after exiting the previous one', async ({ page }) => {
  await mount(page);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.evaluate((body) => {
    history.pushState({}, '', '/p/second');
    document.querySelector('.post-title').textContent = 'A quiet page: second';
    document.querySelector('.available-content').innerHTML = body;
  }, articleBody('second'));
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  await expect(page.locator('#substack-pages-host').getByText('A quiet page: second', { exact: true }).first()).toBeVisible();
});

test('custom-domain homepage activates after SPA navigation to an article', async ({ page }) => {
  await mount(page, { customHome: true });
  await expect(page.locator('#substack-pages-host')).toHaveCount(0);
  await page.evaluate((body) => {
    history.pushState({}, '', '/p/custom-post');
    document.querySelector('main').innerHTML = '<h1 class="post-title">A custom-domain article</h1>' + body;
  }, articleBody('custom-domain'));
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  await expect(page.locator('#substack-pages-host').locator('#flow h1').first()).toHaveText('A custom-domain article');
});

test('SPA URL changes never show the old post under the new address', async ({ page }) => {
  await mount(page);
  await next(page);
  await page.evaluate(() => history.pushState({}, '', '/p/second'));
  await expect(page.locator('#substack-pages-host')).not.toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.locator('#substack-pages-host')).not.toBeVisible();
  await page.evaluate((body) => {
    document.querySelector('.post-title').textContent = 'Second post';
    document.querySelector('.available-content').innerHTML = body;
  }, articleBody('second'));
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  expect((await state(page)).page).toBe(0);
  await expect(page.locator('#substack-pages-host').locator('#flow h1').first()).toHaveText('Second post');
});

test('a late-hydrated title replaces stale metadata without another user action', async ({ page }) => {
  await mount(page);
  await page.evaluate((body) => {
    history.pushState({}, '', '/p/second');
    document.querySelector('.available-content').innerHTML = body;
  }, articleBody('second'));
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  await expect(page.locator('#substack-pages-host').locator('#flow')).toContainText('Opening of second.');
  await page.evaluate(() => {
    document.querySelector('.post-title').textContent = 'The late arriving second title';
    document.querySelector('.subtitle').textContent = 'A late arriving subtitle';
  });
  await expect(page.locator('#substack-pages-host').locator('#flow h1').first()).toHaveText('The late arriving second title');
  await expect(page.locator('#substack-pages-host').locator('#flow')).toContainText('A late arriving subtitle');
});

test('font preference persists and bookmarks are separate for each post', async ({ page }) => {
  await mount(page);
  await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  for (let i = 0; i < 4; i++) await next(page);
  const first = await state(page);
  await page.goto('https://test.substack.com/p/second');
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  expect((await state(page)).page).toBe(0);
  expect((await state(page)).fontSize).toBe(first.fontSize);
  await next(page);
  await page.goto('https://test.substack.com/p/first');
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  await expect.poll(async () => (await state(page)).page).toBe(first.page);
});

test('footnotes jump to their page and media links return to the original', async ({ page }) => {
  await mount(page);
  await page.locator('#substack-pages-host').getByRole('link', { name: 'Jump to the footnote', exact: true }).click();
  await expect.poll(async () => (await state(page)).page).toBeGreaterThan(0);
  await expect(page.locator('#substack-pages-host').locator('#note-one')).toBeInViewport();
  // Find the page containing the media action using only normal page turns.
  while (!(await page.getByRole('link', { name: 'Open media on Substack', exact: true }).evaluate(el => {
    const r = el.getBoundingClientRect();
    const vp = el.getRootNode().querySelector('#viewport').getBoundingClientRect();
    return r.left >= vp.left && r.right <= vp.right && r.top >= vp.top && r.bottom <= vp.bottom;
  }))) await next(page);
  await page.getByRole('link', { name: 'Open media on Substack', exact: true }).click();
  await expect(page.locator('#substack-pages-host')).not.toBeVisible();
});

test('pictures fit inside one page and wide tables stay within the page width', async ({ page }, testInfo) => {
  await mount(page, { imageDelay: 300 });
  await settleImages(page);
  const count = (await state(page)).pages;
  let sawImage = false, sawTable = false;
  for (let i = 0; i < count; i++) {
    const result = await page.evaluate(() => {
      const root = document.querySelector('#substack-pages-host').shadowRoot;
      const vp = root.querySelector('#viewport').getBoundingClientRect();
      const image = root.querySelector('img').getBoundingClientRect();
      const table = root.querySelector('table').getBoundingClientRect();
      const intersects = r => r.right > vp.left + 1 && r.left < vp.right - 1 && r.bottom > vp.top && r.top < vp.bottom;
      return { imageVisible: intersects(image), imageFits: image.left >= vp.left - 1 && image.right <= vp.right + 1 && image.top >= vp.top - 1 && image.bottom <= vp.bottom + 1,
        tableVisible: intersects(table), tableFitsWidth: table.left >= vp.left - 1 && table.right <= vp.right + 1 };
    });
    if (result.imageVisible) {
      sawImage = true;
      expect(result.imageFits).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('picture-page.png') });
    }
    if (result.tableVisible) { sawTable = true; expect(result.tableFitsWidth).toBe(true); }
    if (i < count - 1) await next(page);
  }
  expect(sawImage).toBe(true);
  expect(sawTable).toBe(true);
});

test('an image-only page remains bookmarked after text resize and reload', async ({ page }, testInfo) => {
  await mount(page, { tallImage: true });
  await settleImages(page);
  const imageIsVisible = () => page.locator('#substack-pages-host').locator('img').evaluate(img => {
    const r = img.getBoundingClientRect();
    const vp = img.getRootNode().querySelector('#viewport').getBoundingClientRect();
    return r.left >= vp.left - 1 && r.right <= vp.right + 1 && r.top >= vp.top - 1 && r.bottom <= vp.bottom + 1;
  });
  while (!(await imageIsVisible())) await next(page);
  const visibleText = await page.locator('#substack-pages-host').evaluate(host => {
    const root = host.shadowRoot, vp = root.querySelector('#viewport').getBoundingClientRect();
    const walker = document.createTreeWalker(root.querySelector('#flow'), NodeFilter.SHOW_TEXT);
    const visible = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      if ([...range.getClientRects()].some(r => r.right > vp.left + 1 && r.left < vp.right - 1 && r.top < vp.bottom && r.bottom > vp.top)) visible.push(node.textContent);
    }
    return visible;
  });
  expect(visibleText, 'The fixture must exercise a page with only an image, not a nearby text anchor').toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('image-only-page.png') });
  await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  expect(await imageIsVisible()).toBe(true);
  await page.reload();
  await expect(page.locator('#substack-pages-host')).toBeVisible();
  await settleImages(page);
  expect(await imageIsVisible()).toBe(true);
});

test('a picture-only post opens automatically even without prose', async ({ page }) => {
  await mount(page, { pictureOnly: true, tallImage: true });
  await settleImages(page);
  const image = page.locator('#substack-pages-host').getByRole('img', { name: 'A picture-only post' });
  const visible = () => image.evaluate(el => {
    const r = el.getBoundingClientRect(), vp = el.getRootNode().querySelector('#viewport').getBoundingClientRect();
    return r.left >= vp.left - 1 && r.right <= vp.right + 1 && r.top >= vp.top - 1 && r.bottom <= vp.bottom + 1;
  });
  while (!(await visible())) await next(page);
  await expect(image).toBeInViewport({ ratio: 1 });
});

test('preview preserves an escape to sign-in without fabricating the full post', async ({ page }) => {
  await mount(page, { preview: true });
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This post is for paid subscribers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('cloned article cannot execute inline events or script links', async ({ page }) => {
  await mount(page);
  const unsafe = await page.evaluate(() => {
    const root = document.querySelector('#substack-pages-host').shadowRoot;
    return [...root.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(a => /^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^javascript:/i.test(a.value))).map(a => `${el.tagName}.${a.name}`));
  });
  expect(unsafe).toEqual([]);
  expect(await page.evaluate(() => Boolean(window.cloneEventExecuted || window.cloneLinkExecuted))).toBe(false);
});

test('large type on a narrow phone keeps reading controls and prose inside the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mount(page);
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Larger text', exact: true }).click();
  expect((await state(page)).fontSize).toBe(36);
  for (const name of ['Original', 'Smaller text', 'Larger text', 'Previous page', 'Next page']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: testInfo.outputPath('narrow-phone-largest-type.png') });
  await next(page);
  const clipped = await page.evaluate(() => {
    const root = document.querySelector('#substack-pages-host').shadowRoot;
    const vp = root.querySelector('#viewport').getBoundingClientRect();
    const walker = document.createTreeWalker(root.querySelector('#flow'), NodeFilter.SHOW_TEXT);
    const errors = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (let i = 0; i < node.length; i++) {
        if (/\s/.test(node.textContent[i])) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.right > vp.left + 1 && r.left < vp.right - 1 && (r.top < vp.top - 1 || r.bottom > vp.bottom + 1)) errors.push(node.textContent[i]);
      }
    }
    return errors;
  });
  expect(clipped).toEqual([]);
});

for (const viewport of [{ width: 412, height: 820 }, { width: 800, height: 1100 }]) {
  test(`every prose word appears inside a whole page at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mount(page, { imageDelay: 300 });
    await settleImages(page);
    // Word Ranges detect content present in the DOM but clipped between columns.
    const seen = new Set();
    let expected = [];
    const errors = [];
    const initial = await state(page);
    for (let p = 0; p < initial.pages; p++) {
      const words = await page.evaluate(() => {
        const root = document.querySelector('#substack-pages-host').shadowRoot;
        const viewportEl = root.querySelector('[data-pages-viewport]');
        const box = viewportEl ? viewportEl.getBoundingClientRect() : { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
        const result = [];
        const paragraphs = [...root.querySelectorAll('#flow p')].filter(p => /^(Paragraph \d+\.|Opening of |Words after the picture|END OF )/.test(p.textContent));
        for (const [paragraphIndex, prose] of paragraphs.entries()) {
          const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
          let node, n = 0;
          while ((node = walker.nextNode())) {
            for (const match of node.textContent.matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const r = range.getBoundingClientRect();
              const visible = r.right > box.left + 1 && r.left < box.right - 1 && r.bottom > box.top && r.top < box.bottom;
              const fits = r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
              result.push({ id: `${paragraphIndex}:${n++}`, visible, fits, word: match[0], top: r.top, bottom: r.bottom, boxTop: box.top, boxBottom: box.bottom });
            }
          }
        }
        return result;
      });
      if (p === 0) expected = words.map(w => w.id);
      for (const word of words) {
        if (word.visible && word.fits) seen.add(word.id);
        if (word.visible && !word.fits) errors.push({ p, ...word });
      }
      if (p < initial.pages - 1) await next(page);
    }
    expect(expected.length).toBeGreaterThan(1000);
    expect(errors.slice(0, 10), 'No prose word should be clipped at a page boundary').toEqual([]);
    expect(expected.filter(id => !seen.has(id)), 'Every source word must be visible on at least one page').toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`coverage-final-${viewport.width}.png`) });
  });
}

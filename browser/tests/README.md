# Browser QA

Run `npm ci`, `npx playwright install chromium`, then `npm test` from `browser/`.
The runner and lockfile are pinned. An optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
can select an already installed compatible Chromium for local debugging.

All article fixtures are original synthetic prose, not copies of published posts.
HTTPS requests are intercepted by the tests; no Substack login is required.

## Coverage inventory

| User-visible claim or control | Verification |
| --- | --- |
| Opening an article automatically shows pages | Immediate and delayed body; custom-domain homepage followed by SPA navigation; picture-only post |
| Pages contain complete lines, with no lost prose | Word-range coverage across every page at 412×820 and 800×1100; first and final page screenshots |
| Button presses replace a page without scrolling | Previous/next controls, first/last limits, keyboard controls, EinkBro's numeric and string page-turn hooks |
| Font size and rotation preserve the passage | A−/A+ cycle, landscape resize, font persistence, narrow 320×568 at maximum type size |
| Returning to a post restores its place | Reload and separate bookmarks for different posts; image-only-page resize/reload regression |
| Substack navigation and original features stay available | Original/Pages cycle, native-hook fallback, footnote page jump, media fallback, paid-preview sign-in escape |
| Real-world content loads and fits | Delayed image decode, tall images, wide table, long code and URL, late title/subtitle hydration |
| Other pages and original content remain unaffected | Non-article route, stale SPA DOM, explicit Original dismissal retained after website mutation, sanitized cloned events/links |

Visual artifacts are generated under ignored `browser/test-results/`. Inspect the
phone first/final page, landscape page, picture page, image-only page, and maximum
font screenshot separately from the functional results.

These Chromium checks do not prove physical Bigme button mapping, e-ink refresh
quality, authenticated paid-post access, or browser userscript installation. Those
require separate Android/device integration checks. Synthetic paid-preview tests
verify only that the original sign-in/subscription view remains reachable.

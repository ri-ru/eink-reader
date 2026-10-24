# EinkBro integration evidence

Checked 2026-10-24 against the official **v16.7.1** release (published 2026-10-11), not the obsolete `master` branch. The repository's current default branch is `main`. This is a product implementation note, not a claim of physical-device or paid-account testing.

## Distribution and installation

- [Release v16.7.1](https://github.com/plateaukao/einkbro/releases/tag/v16.7.1) includes [app-universal-release.apk](https://github.com/plateaukao/einkbro/releases/download/v16.7.1/app-universal-release.apk), 4,799,165 bytes in the release metadata at inspection time. The universal build avoids assuming the user's exact Bigme CPU architecture.
- [User guide: Userscripts](https://plateaukao.github.io/einkbro/guide.html#feature-userscripts) documents installation by tapping a `.user.js` link, accepting the prefilled editor with **OK**, and automatic execution on matching pages. The fallback is **Settings → Site Settings → Userscripts → Add userscript → Install from URL → Fetch → OK**.
- [`NinjaWebViewClient.kt`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/browser/NinjaWebViewClient.kt#L404) recognizes URLs whose parsed path ends in `.user.js`. [`UserScriptListActivity.kt`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/activity/UserScriptListActivity.kt#L108) fetches that URL and presents the editor.
- [`UserScriptMetadata.kt`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/userscript/UserScriptMetadata.kt#L48) maps `@run-at document-idle` to `DOCUMENT_END`; unspecified/document-end also maps there. [`UserScriptManager.kt`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/userscript/UserScriptManager.kt) applies metadata URL rules, deduplicates by name, and supports manual versioned updates through `@updateURL` / `@downloadURL`.

**Verified installation routes:** opening the rendered GitHub setup guide **inside EinkBro** and tapping **Install Substack Pages** opens the prefilled **1.0.2** editor; accepting **OK** installs it. The explicit **Userscripts → + → Install from URL → Fetch → OK** route was also exercised successfully in the emulator.

**Observed installation edge:** opening a raw `.user.js` URL through an external Android intent displays source rather than the installation editor. That route calls `loadUrl` without passing through `shouldOverrideUrlLoading`, where script-link interception happens. This is why the setup guide says to tap its installation link from a page already open **inside EinkBro**.

## Native page-button bridge

[`WebViewNavigationHelper.kt`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/view/WebViewNavigationHelper.kt#L44) implements the ordinary horizontal reading path as:

```kotlin
// pageDownWithNoAnimation(), when not in native vertical/two-column mode:
jsPageScroll(1) { handled ->
    if (!handled) {
        webView.scrollBy(0, shiftOffset())
        // ... native clamping
    }
}

// pageUpWithNoAnimation(): same route with jsPageScroll(-1).
```

Its [JavaScript invocation](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/view/WebViewNavigationHelper.kt#L157) is:

```kotlin
webView.evaluateJavascript(
    "window.__einkbroPageScroll && window.__einkbroPageScroll($direction, $offsetPercent, $offsetPx)"
) { result ->
    fallback(result?.trim('"') == "true")
}
```

Thus the script can replace `window.__einkbroPageScroll` with a handler accepting **+1 for next** and **−1 for previous**, returning boolean `true` (or string `"true"`) when it handled the action. Returning true at the first/last page is important too: it prevents native scroll fallback from moving the underlying document.

The other two arguments are the configured overlap, as a fraction and pixels respectively. Actual paginated columns should ignore them: a turn means exactly one page, not one viewport minus overlap. When the paginated overlay is inactive, preserve/delegate to the prior function so normal browsing retains its behavior.

Native **Jump to Top** first calls `webView.scrollTo(0, 0)` and then evaluates:

```javascript
window.__einkbroScrollToTop && window.__einkbroScrollToTop()
```

There are no arguments and no return-value test for this hook. Native **Jump to Bottom** has no corresponding JavaScript hook in this release. The script's own footer controls should be the primary visible navigation affordance.

### Injection order

[`fix_scrolling.js`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/assets/fix_scrolling.js) defines both globals. [`WebContentPostProcessor.kt`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/browser/WebContentPostProcessor.kt#L68) installs it once per document.

[`NinjaWebViewClient.onPageFinished`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/browser/NinjaWebViewClient.kt#L311) runs that postprocessor before injecting `DOCUMENT_END` userscripts. Using `document-idle` therefore lets Substack Pages wrap the built-in hook after it exists. Site navigation, dynamic post content, and reinjection still need idempotent handling in our script.

### Custom-domain homepages

The userscript deliberately matches `https://*/*`, then immediately checks for a `substack.com` host, Substack CDN script/stylesheet assets, or `.body.markup`. It exits on unrelated pages before installing observers, keyboard handlers, or native page hooks. A narrower `/p/*` metadata rule misses a custom-domain publication homepage that opens a post through same-document navigation: the userscript was never installed in that document, and EinkBro does not inject `DOCUMENT_END` scripts on every `pushState` change. The broad match plus positive site detection covers this path without transmitting page data. Actual pagination still requires a recognized post route and article body.

## Key routes and defaults

| Input/configuration | Verified v16.7.1 behavior |
| --- | --- |
| Volume down/up | [`KeyHandler.performVolumePageTurn`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/activity/KeyHandler.kt#L240) routes to next/previous no-animation methods in ordinary horizontal mode. |
| **Volume key** | [`TouchConfig`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/preference/TouchConfig.kt#L18) default is **true**. The [touch guide](https://plateaukao.github.io/einkbro/guide.html#feature-touch) locates it in **Quick toggle**. |
| Long-press volume | Temporarily disables page turning for five seconds and adjusts volume; use short presses for reading. |
| **Double-click for back** | Default **false**. When enabled, short-press page turns are deferred to distinguish a double click. It is not required for Substack Pages. |
| **Use Up/Down key** | Default **false**; **Settings → Behavior** enables D-pad up/down routing to the same no-animation methods. [Behavior settings source](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/setting/screens/BehaviorSettings.kt#L119). |
| Toolbar **Page Up / Page Down** | [`ToolbarActionHandler`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/view/handlers/ToolbarActionHandler.kt#L73) dispatches page actions; [`BrowserActivity`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/activity/BrowserActivity.kt) calls the same no-animation methods. |
| Touch turn areas | Optional; default disabled. Native Ebook touch interception also reaches the no-animation page methods. It is not needed when using our footer or volume buttons. |

There is **no verified smooth/page-turn-animation preference to disable** in this release. The no-animation methods are the direct page-action route. Do not invent an extra setup step based on the method name.

The exception is EinkBro's own **Vertical mode** / **two-column Reader mode**: they use dedicated native horizontal positioning before the JavaScript hook is considered. Substack Pages should be used without those modes. Its own layout and controls replace their role for articles.

## Why a userscript is still necessary

Stock page buttons normally move a scrolling page by a viewport with overlap; they do not necessarily reflow it into complete book-like pages. Stock reader mode is a separate manual action. Although the current guide says site settings can remember reader mode, v16.7.1's [`DomainConfigurationData`](https://github.com/plateaukao/einkbro/blob/v16.7.1/app/src/main/java/info/plateaukao/einkbro/database/DomainConfiguration.kt) has no reader-mode flag, and native reader state is reset when a new document loads. The implementation does not rely on that documentation claim.

The install-once script supplies automatic article detection, complete-page reflow, its own previous/next and font controls, and a bridge from native buttons. It works on the content already rendered by Substack in the browser's existing account session. No authenticated paid post was available for this source inspection; subscription/login compatibility is an architectural expectation to verify separately, not an observed end-to-end result.

## Runtime verification, 2026-10-24

The [20-test Chromium suite](tests/README.md) passed locally and in [GitHub Actions on Ubuntu Chromium](https://github.com/ri-ru/eink-reader/actions/runs/40083480940) at commit `1330558`, with **Substack Pages 1.0.2** (CI test duration: **8.2 seconds**). Coverage includes complete-word coverage on phone/tablet, narrow screens at maximum text size, image-only posts and reading positions, delayed title hydration, custom-domain SPA navigation, and native-hook behavior. Its fixtures are synthetic; it does not use a Substack account.

Separately, the official EinkBro **16.7.1** APK (`versionCode 10112256`) was installed in an isolated **Android 16 ARM64** emulator (**API 36, 36.1 system image**), with **WebView 134.0.6998.135**, a **1080×2400** display and **420 dpi**. **Substack Pages 1.0.2** was installed through the GitHub setup guide's **Install** link, its version was confirmed in the prefilled editor, and the live article was refreshed before testing:

- The [live public One Useful Thing post](https://www.oneusefulthing.org/p/the-shape-of-the-thing) automatically displayed the heading **The Shape of the Thing** and **23 pages**, with **22px** type, a **411×840 CSS-pixel** viewport, and device-pixel ratio **2.625**.
- A real Android `KEYCODE_VOLUME_DOWN` input changed the visible page counter **1 → 2** (zero-based state **0 → 1**) and applied `translateX(-395px)`; `KEYCODE_VOLUME_UP` returned it **2 → 1**. `scrollX` and `scrollY` stayed **0** throughout: these were page replacements, not vertical scrolling.
- EinkBro's default key settings and built-in Reader mode were left untouched; no animation or key-configuration step was necessary.
- Screenshots were inspected visually and showed clean controls and complete line flow. The isolated emulator was shut down and removed after verification.

These observations verify **1.0.2** through the real Android app's install and native-button routes, rather than merely calling the JavaScript hook in a desktop test. They do **not** verify the physical Bigme's key mapping or e-ink refresh behavior, nor authenticated paid-post access.

# Substack Pages

Open a Substack post in **EinkBro** and it becomes a book-like page automatically. Press **Next** or a volume button to turn the page. There is no EPUB export, file transfer, server, or per-post conversion step.

## Install once on the Bigme

1. Install [EinkBro 16.7.1 — universal APK](https://github.com/plateaukao/einkbro/releases/download/v16.7.1/app-universal-release.apk). Android may ask you to allow installation from the browser you used to download it.
2. **In EinkBro**, open [Install Substack Pages](https://raw.githubusercontent.com/ri-ru/eink-reader/refs/heads/feat/substack-pages/browser/substack-pages.user.js). EinkBro opens a script editor; tap **OK**. You do not need to edit the code.
3. Open [Substack](https://substack.com/) in EinkBro and sign in normally. Browse your subscriptions and open a post. Its readable article text switches into pages automatically.

Use EinkBro to read Substack from now on; this does not change how the separate Substack app displays articles. You can bookmark Substack in EinkBro for quick access. Signing in happens on Substack itself, not through this script.

If the installation link only displays code, open **Settings → Site Settings → Userscripts → Add userscript**, paste the installation link into **Install from URL**, tap **Fetch**, then **OK**. Make sure you are using EinkBro 16.7.1 or later.

## Reading

| Control | Action |
| --- | --- |
| **Previous / Next** | Turn one page, without an animated scroll. |
| Short press **volume up / down** | Previous / next page, when EinkBro's **Volume key** option is enabled. |
| **A− / A+** | Smaller / larger text; pages adjust to fit. |
| **Original** | Return to the original post for comments, sign-in, or interactive content. It stays in original view for this visit. |
| Floating **Pages** button | Return to paginated reading after choosing **Original**. |

Reading progress is saved locally for that post. Returning to it restores your place. Changing text size or orientation changes the number of pages.

There is **no animation setting to configure** in EinkBro 16.7.1: its volume-key and page-button actions already use its no-animation path, and Substack Pages handles those actions directly. Do **not** enable EinkBro's separate **Reader mode** or **Vertical mode** for these posts; Substack Pages supplies its own reading layout.

## Buttons and links

- **Volume buttons change the sound instead:** open EinkBro's hamburger menu → **Quick toggle** and enable **Volume key**. It is on by default in 16.7.1. Use short presses: a long press temporarily restores normal volume control for five seconds.
- **A Bluetooth/page-turn button sends Up/Down instead:** enable **Settings → Behavior → Use Up/Down key**. This is off by default. The exact Bigme hardware key mapping still depends on the device.
- **A Substack link keeps opening the Substack app:** open Android's app settings for Substack and disable **Open supported links**, if that option is available; make EinkBro your default browser. Android/Bigme menu labels vary. Browsing directly inside EinkBro does not require this change.
- **A post stays in its original layout:** allow it to finish loading and check that Substack Pages is enabled in EinkBro's Userscripts screen. Login screens, feeds, and pages without recognizable Substack article text intentionally stay unchanged.
- **A post looks incomplete:** choose **Original** and check the original article. The script can only show content the website has actually loaded for your account; it cannot unlock a paywall.

## Scope and privacy

The script reformats the article already loaded by your browser. Your Substack login and subscription access remain in that browser's normal session. It does not ask for a password, export cookies, fetch through a third-party converter, or upload article contents.

Progress and text preferences use the website's local browser storage, separately for each origin. They are not synchronized between devices, browsers, or different publication domains; clearing site data can erase them. The original website and embedded media can still make their normal network requests.

This is an article reader, not a replacement for Substack's entire interface. Feeds, comments, subscription dialogs, audio/video controls, and other interactive content are available through **Original**. Site redesigns can require a script update. In EinkBro's Userscripts screen, **Check for update** updates the installed script; updates are not automatic.

## Verification

The integration targets the official EinkBro **16.7.1** release. Its install flow, native page-turn hook, and setting defaults are checked against upstream source in [UPSTREAM.md](UPSTREAM.md). Browser and Android integration verification is documented with the implementation's tests. Paid authenticated Substack access and the physical Bigme device are not claimed as tested.

Source: [substack-pages.user.js](substack-pages.user.js). To remove it, disable or delete **Substack Pages** in EinkBro's Userscripts screen, then reload the post.

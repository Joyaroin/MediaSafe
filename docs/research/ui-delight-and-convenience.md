# UI delight and convenience: research for MediaSafe

**Date:** 2026-10-10. **Status:** research notes, not a decision. Nothing here is built.

## Summary

The best convenience gains for MediaSafe come from platform plumbing, not new visuals.

- **Install.** Chrome no longer needs a service worker for any install path, including the automatic prompt. MediaSafe's manifest, however, still lacks the raster icons and `start_url` that the documented install criteria ask for.
- **Where to watch.** MediaSafe shows provider logos that link nowhere. TMDB returns a per-region `link` that leads, one tap later, to the provider's own URL. Android App Links then open that URL in the installed app.
- **Calendar feed.** Trakt removed its paid iCal feed in v3, and paying users were angry. A per-user ICS feed fills a gap no competitor fills today. Its weak point is that Google Calendar on Android cannot subscribe to a URL.

On delight:

- **Finishing a show.** No competitor I found marks the moment you finish a show or season. This is an open gap, and it fits MediaSafe's accent rule.
- **Year in review.** Letterboxd, Trakt (VIP), Plex and Serializd all ship one. Users punish recaps that get the numbers wrong.
- **Haptics.** Android-only haptics on the mark are cheap.

Things to skip:

- **WebGL** costs at least 134 KB gzip and is capped at 8 contexts on Android.
- **Push notifications** and **app badges** are impossible without a service worker, and badges do not exist on Android Chrome at all.

How this was gathered:

- **Platform support versions** come from MDN's browser-compat-data 8.1.5 (2026-10-08), queried locally: Chrome / Chrome Android 155, Firefox 157, Safari / iOS 27.
- **Bundle sizes** were measured with esbuild (minify plus gzip -9) and cross-checked against bundlephobia.
- **Reddit, Google Play reviews and X** could not be fetched by the research tools. Complaint evidence therefore comes from App Store listings, official forums, Trustpilot and news coverage. Anything that came only from a search snippet or a secondary write-up is marked **unverified — secondary source only**.

---

## Ranked recommendations

### 1. Make the manifest meet the install criteria (no service worker needed)

**What.** Complete `app/manifest.ts`. Today it has `name`, `display: "standalone"` and a single `icon.svg` with `sizes: "any"`. It has **no `start_url`** and **no 192 px or 512 px raster icons**.

- Add `start_url`, PNG icons at 192 and 512 (plus a maskable variant), and `screenshots`.
- `description` is already there. With `screenshots` added, Chrome replaces the mini-infobar with a richer install dialog ([web.dev, installation prompt](https://web.dev/learn/pwa/installation-prompt)).
- Optionally, use `navigator.getInstalledRelatedApps()` to hide an in-app "Install" hint once the app is installed.

**Why.**

- **The current criteria do not include a service worker.** They are ([web.dev, install criteria](https://web.dev/articles/install-criteria), updated 2024-09-19):
  - the app is not already installed
  - the user has interacted with the page at least once and spent at least 30 s on it
  - the page is served over HTTPS
  - a manifest with `name` or `short_name`, 192 px and 512 px `icons`, `start_url`, a `display` of standalone or similar, and `prefer_related_applications` absent or false
- **MDN agrees:** service workers are "not a requirement for a PWA to be installable" ([MDN, Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), modified 2026-10-06).
- **Chrome's own blog is out of date on this.** [Chrome's 2023 post](https://developer.chrome.com/blog/update-install-criteria) says the install *prompt* "still requires the presence of a fetch() handler". Chromium source shows that check was later removed on every platform:
  - commit `6d1a3de7f3` (2023-10-26): "SW check has been removed from installable check for all platform"
  - commit `ca9ded6828` (2024-08-16): deleted the worker parameters, including from the WebAPK update fetcher
- **The prompt is not guaranteed.** On Android, Chrome uses an ML model to decide whether to show the automatic prompt ([Chrome blog](https://developer.chrome.com/blog/how_chrome_helps_users_install_the_apps_they_value)). The menu "Install app" is always available.

**Fit.**

- **No conflict with the no-service-worker rule.**
- **Offline behaviour fits the existing rules.** Offline, the installed app shows Chrome's default offline page. That is consistent with "no offline queue" and does not render a failed read as empty.
- **Unverified:**
  - Whether Chromium accepts an SVG `sizes: "any"` icon in place of the 192/512 PNGs. Check DevTools → Application → Manifest → Installability.
  - Whether a WebAPK (the full Android install, not a shortcut) is minted without a service worker. No primary doc says so outright; I inferred it from the WebAPK fetcher code above no longer checking for a worker.

**Effort:** S.

### 2. Make the where-to-watch cards open the title on the service

**What.** `tmdb/live-facts.ts` reads `flatrate`, `free` and `ads` but ignores `results[region].link`. `WatchProviders` in `app/(signed-in)/library/live-title-facts.tsx` renders cards that are not links.

- Read `link` and make each card, or the section, an `<a>` to it.
- That TMDB page lists JustWatch redirect buttons that resolve to provider https URLs, such as `netflix.com/title/{id}`, `disneyplus.com/play/{uuid}`, `watch.amazon.com/detail?gti=…` and `play.hbomax.com/video/watch/{uuid}`. Android App Links open these in the installed app.

**Why.**

- **TMDB says outright that it returns no deep links:** "This is not going to return full deep links … You can link to the provided TMDB URL to help support TMDB and provide the actual deep links to the content" ([TMDB, TV watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers)). The movie endpoint is the same ([TMDB, movie watch providers](https://developer.themoviedb.org/reference/movie-watch-providers)).
- **Competitors treat one-tap to the streaming app as table stakes:**
  - Trakt "Watch Now" ([Trakt App Store version history](https://apps.apple.com/jp/app/id1514873602))
  - Sequel+ "one tap opens the streaming app" ([Sequel App Store](https://apps.apple.com/us/app/sequel-media-tracker/id1630746993))
  - JustWatch's own app
- **The provider domains register their apps.** Verified 2026-10-10 by fetching each `/.well-known/assetlinks.json`:

  | Domain | Android package |
  |---|---|
  | `www.netflix.com` | `com.netflix.mediaclient` |
  | `www.disneyplus.com` | `com.disney.disneyplus` |
  | `www.primevideo.com`, `watch.amazon.com` | `com.amazon.avod` |
  | `play.hbomax.com` | `com.wbd.stream` |
  | `shahid.mbc.net` | `net.mbc.shahid` |

  Which URL paths each app actually claims is set in its own manifest and was not checked. App Links work "without requiring the user to select your app from a disambiguation dialog" ([Android, App Links](https://developer.android.com/training/app-links)).

**Fit.**

- **Attribution rule.** TMDB requires: "In order to use this data you must attribute the source of the data as JustWatch" (TMDB pages above). The existing "Data by JustWatch" line already satisfies that.
- **No accent conflict.** The cards are not the primary button and must not turn vermilion.
- **Do not scrape the redirect URLs out of TMDB's HTML** to skip the hop. It is fragile, and I did not check whether TMDB's terms allow it.
- **Regional data is patchy.** Example: Loki returned no AE offers, and Stranger Things has different Netflix IDs in AE than in EG and SA. This is my observation, not documented behaviour.

**Effort:** S.

### 3. A per-user ICS calendar feed of upcoming episodes

**What.**

- Serve `GET /cal/<token>.ics`, where the token is a long random value stored hashed and there is a "Reset link" action in Settings.
- Each unaired episode becomes an **all-day** `VEVENT`: `DTSTART;VALUE=DATE` plus `DTEND;VALUE=DATE` set to the next day.
- Build `UID` from the TMDB episode id plus a user scope.
- Add `REFRESH-INTERVAL` and `X-PUBLISHED-TTL`.
- Send `ETag` / `Last-Modified` headers.

**Why.**

- **Trakt removed this feature, and paying users noticed.**
  - Trakt's Director, 2026-07-20: "This is not a built in feature of Trakt v3" ([Trakt forum](https://forums.trakt.tv/t/117529.json)).
  - On the roadmap item (76 votes): "In V3 this functionality is completely gone", "can't believe a VIP paid for feature was removed", and several users say it was their only reason to pay ([roadmap.trakt.tv/p/rss-feed](https://roadmap.trakt.tv/p/rss-feed)).
  - More threads: [124088](https://forums.trakt.tv/t/124088.json), [122331](https://forums.trakt.tv/t/122331.json).
  - Hobi syncs episodes to the system calendar ([Hobi App Store](https://apps.apple.com/us/app/id1387915223)).
- **It replaces push notifications.** With no service worker, MediaSafe cannot send new-episode notifications (see Q3). A calendar entry is the substitute that the platform allows.

**Fit.**

- **No service worker or cache involved.** It is a plain server route. The token URL must not require a session cookie.
- **Weak point: getting the feed added on Android.**
  - Google's help page: "You can't subscribe to a calendar in the Google Calendar app for Android, iPhone, or iPad". The user must add it on calendar.google.com from a computer ([Google Calendar help 37100, Android version](https://support.google.com/calendar/answer/37100?hl=en&co=GENIE.Platform%3DAndroid)).
  - The alternative is [ICSx5](https://icsx5.bitfire.at/), which subscribes on the device itself.
  - So the UI is a **Copy link** button with two short instructions, not a `webcal://` button.
- **Refresh timing.** Google publishes no refresh interval for subscribed calendars. See Q4.

**Effort:** M. It covers the route, token table, reset action and RFC folding / escaping. Section Q4 has a ready RFC-correct example.

### 4. A "season finished" / "show finished" moment on the mark

**What.** When a mark records the final episode of a season or the series, that card's existing 1.2 s vermilion hold gets one extra beat:

- a short line of copy such as "Season 2 done" or "That's the show";
- an Android haptic pulse (see #5).

Nothing else changes: same place, same timing, same Undo. No confetti, no modal, no new screen.

**Why.**

- **Nobody does this.** Across Trakt, Sequel, Letterboxd, Serializd, TV Time, Hobi, Showly, Callsheet, Infuse, Plex and JustWatch, the research found no finishing-a-show celebration in any listing, changelog or help page. That is absence of evidence across those first-party pages, not proof it exists nowhere.
- **The nearest analogue is stats:**
  - TV Time's completed-show counts and badges ([Wikipedia: TV Time](https://en.wikipedia.org/wiki/TV_Time); the service shut down on 2026-07-15, [TechCrunch](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai))
  - Serializd's "completed shows" stat ([Serializd App Store](https://apps.apple.com/us/app/serializd/id1581244120))

**Fit.**

- **Accent rule: compatible.** The moment *is* "a watch was recorded", so vermilion is legitimate. Do not add a second colour for "celebration".
- **One-motion rule: compatible, but only if kept in place.** That rule governs navigation. If the moment becomes a route, a sheet or a full-screen takeover, it is a new motion and breaks the rule.
- **Implementation.**
  - Use `@starting-style` with transform/opacity only. It is already used across `globals.css`, and support is Chrome 117, Firefox 129, Safari 17.5 (BCD).
  - Under reduced motion, show the copy without movement.
- **The Undo must cancel the moment too.**

**Effort:** S to M. The "is this the last episode?" fact needs TMDB season data at mark time, and the season may still be airing.

### 5. Haptic tick on the mark (Android only)

**What.** Call `navigator.vibrate(10)` or similar when a mark commits, behind feature detection. Use a slightly longer pattern for #4.

**Why.**

- **Support** (BCD):
  - Chrome Android has supported it since 32, and since 60 it requires a user gesture, returning `false` without one.
  - MDN lists `vibrate()` under **sticky** activation, so any earlier tap in the session is enough ([MDN, User activation](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)).
  - iOS Safari: not supported through 27. Firefox Android returns `true` but does not vibrate (BCD).
- **The primary device is an Android phone,** so the two real users get it.

**Fit.**

- **Not a visual motion,** so the reduced-motion question doesn't arise directly. A Settings toggle is still worth it, because some people dislike haptics.
- **Fire it on commit,** not when the 1.2 s hold starts. Otherwise an Undo follows a "done" buzz.

**Effort:** S.

### 6. Year in review on the You page

**What.**

- A December/January view of the year built from data MediaSafe already records: hours, titles finished, most-watched show, busiest month, longest binge.
- Optionally, export a share image through `navigator.share({ files })`.

**Why.**

- **Every well-regarded competitor ships one:**
  - Letterboxd's Year in Review, free on every plan, emailed on 2026-01-02. It requires at least 10 diary-dated films and does not count watched-only marks ([Letterboxd FAQ](https://letterboxd.com/journal/2025-letterboxd-year-in-review-faq/)).
  - Trakt's Year and Month in Review, VIP-only ([Trakt App Store](https://apps.apple.com/us/app/trakt-tv-shows-movies/id1514873602)).
  - Plex Rewind, Plex Pass only ([Plex blog](https://www.plex.tv/blog/2025-plex-rewind/); 403 on fetch, so **unverified — secondary source only**).
  - Serializd's "Best of 2025" ([App Store version history](https://apps.apple.com/us/app/serializd/id1581244120)).
- **Users punish wrong recaps.** A Serializd App Store review (2024-12-18) called its recap "odd": it missed longer viewing and mislabelled a miniseries.

**Fit.**

- **Accent rule: a real constraint.** Charts and hero numbers must be in the neutral linen tones. Vermilion may appear only on, for example, the live edge of the record. A "Wrapped" palette of bright colours breaks the rule.
- **Error rule.** A recap built from a failed read must throw to `read-failure`, not show "0 hours".
- **Sharing.**
  - Generate the image *before* the tap: `navigator.share()` needs **transient** activation, a fresh gesture, so no slow `await` between the tap and the call (MDN user-activation page above).
  - File sharing works on Chrome Android 76+ (BCD).

**Effort:** M (view only) to L (with an image renderer).

### 7. Spoiler guard for unwatched episodes

**What.** A setting that hides titles, overviews and stills for episodes after the user's next unwatched one. Show "Episode 7" until it is marked.

**Why.**

- Trakt added a Spoilers toggle in 3.1.1 ([Trakt version history](https://apps.apple.com/jp/app/id1514873602)).
- Callsheet's spoiler protection hides character names, episode counts, titles and thumbnails ([Callsheet App Store](https://apps.apple.com/us/app/callsheet-find-cast-crew/id1672356376)). It is an Editors' Choice app rated 4.9★.

**Fit.** No conflicts. It is purely a presentation rule on the title page and Coming up.

**Effort:** S.

### 8. Accept shares into MediaSafe (Web Share Target)

**What.**

- Add a `share_target` with method GET to the manifest.
- Sharing a link from Netflix, IMDb or a browser into MediaSafe opens `/share?text=…&url=…`.
- MediaSafe parses a TMDB or IMDb URL and lands on Search, or on the title's add action.

**Why.**

- **Support.** Chrome Android 76+; not in Safari or Firefox (BCD).
- **It must be installed:** "your web app has to be installed before it will show up as a potential target" ([Chrome, Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)). This depends on #1.
- **Android quirk.** On Android, `url` usually arrives empty and the link is in `text` (same page).
- **No service worker needed.** The spec has the browser navigate to `action` "just like an HTML form submission" ([W3C Web Share Target](https://w3c.github.io/web-share-target/)). A GET target is a normal page.
- **The IMDb → TMDB step** needs TMDB's find-by-external-id endpoint ([TMDB, find by ID](https://developer.themoviedb.org/reference/find-by-id)). I did not re-check that page in this research.

**Fit.** No service-worker conflict. A failed parse must be a plain sentence, not an empty search.

**Effort:** M.

### 9. Polish the existing poster→title morph with modern View Transition features

**What.**

- **`view-transition-class`** (Chrome 125, Firefox 144, Safari 18.2) lets all poster groups share one CSS rule instead of per-name selectors.
- **Nested view-transition groups** (`view-transition-group`, Chrome 140, Chromium-only) keep the poster's rounded-corner clip and 3D transform inside the morph ([Chrome, nested groups](https://developer.chrome.com/docs/css-ui/view-transitions/nested-view-transition-groups)). Without them, the snapshot can lose clipping mid-flight. Treat this as Chrome-only polish that degrades to today's behaviour.

**Why.**

- **Same-document VT is Baseline (Newly available)** as of Firefox 144 on 2025-10-14. Firefox only gained `:active-view-transition-type()` in 147, and React's `<ViewTransition>` uses types ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)).
- **Chrome 140 fixed a one-frame flicker** at the end of transitions ([Chrome, View Transitions in 2025](https://developer.chrome.com/blog/view-transitions-in-2025)).

**Fit.** This is the *same* motion, refined. It adds no new vocabulary.

**Effort:** S.

### 10. A scroll-linked title-page hero, done with CSS only

**What.** As the title page scrolls, the blurred backdrop drifts slightly slower than the content, or the hero poster scales down a little. Use `animation-timeline: scroll()` or `view()` on `transform`/`opacity` only, inside `@supports (animation-timeline: view())`.

**Why.**

- **Support:** Chrome 115, Safari 26. Firefox release does not ship it (BCD).
- **It stays smooth under main-thread load.** Chrome's case study found the CSS version "completely unaffected" by heavy main-thread JS while the JS version "becomes janky" ([Chrome case study](https://developer.chrome.com/blog/scroll-animation-performance-case-study)). That matters on a mid-range phone during hydration.

**Fit: borderline.**

- **One-motion rule:** it is not a navigation motion, so it doesn't break the letter of the rule. It does add a new kind of movement. Given that three rounds of directional-slide complaints led to the rule, **ask the owner before building this**.
- **Reduced motion:** off.

**Effort:** S.

### Considered and ranked low

- **Viewing streak.** Trakt is the only tracker with one: "a viewing streak card to Home" in 3.7 ([Trakt version history](https://apps.apple.com/jp/app/id1514873602)). For two people, a streak turns watching TV into an obligation. That is my judgment; I found no evidence either way. If built at all, make it a passive stat on the You page, never a nag.
- **"Drop show" with a date.** Trakt's Drop Show hides a show from Up Next, Progress and Calendar but keeps its history ([Trakt forum](https://forums.trakt.tv/t/goodbye-hide-hello-drop/51853)). Worth having if MediaSafe lacks an equivalent; I did not audit this.
- **Screen Wake Lock.** Chrome 84+ ([Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock)). MediaSafe has no screen the user watches passively, so there is no use case.

---

## Things to avoid

| Avoid | Evidence |
|---|---|
| **WebGL, three.js, R3F or Spline for posters or the grid** | Measured gzip sizes:<br>• three, minimal renderer: **134 KB**<br>• three, full: 191 KB (bundlephobia: 185 KB)<br>• @react-three/fiber: 59 KB on top of three<br>• drei subset: 292 KB on top<br>• @splinetool/runtime: 292 KB static JS, 4.07 MB of JS chunks in all, plus WASM files (physics 1.6 MB, hana-ui 3.4 MB)<br>React + react-dom is 60 KB, for comparison. Chromium caps active WebGL contexts at **8 on Android**, and beyond that the oldest is lost ([Chromium source](https://chromium.googlesource.com/chromium/src/+/main/content/renderer/webgraphicscontext3d_provider_impl.cc)). Contexts can also be lost at any time, and you cannot query how much VRAM is available ([MDN, WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). |
| **A permanent `will-change: transform` on every poster** | Each promoted layer "requires memory and management", and "on devices with limited memory the impact on performance can far outweigh any benefit" ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). Set `will-change` just before a change and remove it afterwards ([web.dev animations guide](https://web.dev/articles/animations-guide)). Promote only the poster being tilted or morphed. |
| **Planning new-episode push notifications or an app-icon badge** | Without a service worker this is impossible. On Chrome Android, notifications "can only be sent from a service worker", and `PushManager` lives on the service worker registration (BCD). The Badging API is "not supported" on Android ([Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/badging-api)); Android's dot comes from notifications. Use the ICS feed (#3) instead. |
| **Building your own Netflix / Disney+ / Prime deep links** | No provider publishes deep-link docs for third parties. TMDB has no streaming-service IDs ([TMDB external IDs](https://developer.themoviedb.org/reference/tv-series-external-ids)). JustWatch's API gives `deeplink_android` and similar fields only under contract ([JustWatch API](https://apis.justwatch.com/docs/api/)). Watchmode hides deep links on the free plan; they start at $349/mo ([Watchmode](https://api.watchmode.com/)). Use TMDB's `link` (#2). |
| **A `webcal://` subscribe button as the main path** | Google Calendar on Android cannot subscribe by URL (Google help 37100, above). Reports that `webcal:` opens the Calendar app, which then can't subscribe, are **unverified — secondary source only** ([The Events Calendar KB](https://theeventscalendar.com/knowledgebase/?p=1964006)). |
| **Removing a feature during a redesign** | This is the top complaint pattern across apps:<br>• Trakt V3: "Some features were temporarily removed" (iOS 3.0.1 notes); the iCal backlash (#3); "Bring back shows and movies pagination" ([forum, 2026-10-10](https://forums.trakt.tv/t/bring-back-shows-and-movies-pagination/125184)); early reaction called "mostly negative" ([AlternativeTo](https://alternativeto.net/news/2025/11/trakt-unveils-a-full-redesign-of-its-movie-and-tv-tracking-platform-for-web-and-mobile/))<br>• Plex: Watch Together cut; continue watching "now split up between my libraries" ([Plex forum](https://forums.plex.tv/t/new-ui-is-an-awful-experience/931048), [HotHardware](https://hothardware.com/news/plex-punts-a-popular-feature))<br>• TV Time's 2023 redesign removed, then restored, the episodes-remaining counter (**unverified — search snippet only**) |
| **Silent data loss and silent sync failure** | • Trakt: "Watchlist deleted with update" ([forum, 2026-10-07](https://forums.trakt.tv/t/watchlist-deleted-with-update/124990)); "completely broken. status page says nothing is wrong" ([forum, 2026-09](https://forums.trakt.tv/t/trakt-is-completely-broken/124387))<br>• JustWatch: watchlists vanished after an update (App Store review, 2025-02-18)<br>• Infuse ↔ Trakt sync broke ([Firecore forum](https://community.firecore.com/t/trakt-not-syncing/59023))<br>MediaSafe's error discipline already guards against this. Keep it on any new surface (ICS route, recap, share target). |
| **Oversharing and notification overreach** | Plex's "Week in Review" email told friends what you had watched: "what a bad idea for an email" ([Birchtree](https://birchtree.me/blog/plex-started-emailing-your-friends-and-family-what-youve-been-watching-people-didnt-like-that)). Keep shares user-initiated, and keep the ICS feed behind a secret, resettable URL. |
| **Ads and limits added later** | • Letterboxd: "egregiously intrusive ads" (App Store, 2025-12-07)<br>• Trakt: the free tier was capped at 100 items, prompting "low-key predatory" ([forum](https://forums.trakt.tv/t/freemium-experience-more-features-for-all-with-usage-limits/41641)); VIP doubled from $30 to $60 ([AlternativeTo](https://alternativeto.net/news/2025/2/trakt-tv-has-set-stricter-limits-for-free-users-and-raised-vip-subscription-prices-by-100-/))<br>Not a risk for a two-user app, but it is why people leave these apps. |
| **Large artwork that hurts scanning** | TV Time's own "Redesign Update" reportedly said large images made Watch List and Upcoming hard to scan. **Unverified:** the page now shows a farewell notice ([tvtime redesign-update](https://webv1.tvtime.com/article/redesign-update)). This supports keeping Up next as compact cards. |

---

## Q1. What competitors do

There were no Apple Design Award winners or finalists in this category in [2025](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) or 2026 ([Macworld](https://www.macworld.com/article/3155565/apple-just-picked-a-dozen-apps-you-need-to-download-right-now.html); **secondary source**). There were none in Material Design Awards 2015–2021 either ([XDA](https://www.xda-developers.com/material-design-award-winners-2021/)), and no later editions were found.

| App | Delight and convenience features (primary source unless marked) |
|---|---|
| **Trakt** (rebuilt as "New Trakt" from 2025-10-31; [forum](https://forums.trakt.tv/t/new-trakt-default-web-experience/82458)) | From the iOS version history ([JP store](https://apps.apple.com/jp/app/id1514873602); 3.x dates show no year, inferred to be 2026):<br>• "Mark as Watched" renamed "Track", with "faster tracking" (3.1.1)<br>• viewing streak card with monthly stats (3.7)<br>• "Now Watching" Lock Screen Live Activity with end time<br>• free Home Screen widgets; progress bars on Continue Watching (3.10.1)<br>• Spoilers toggle<br>• Year / Month in Review (VIP)<br>• "Screen Time" section with peak hours (3.8)<br>• calendar filters for Premieres / Finales; notification timing offsets<br>• JustWatch-powered "Watch Now"<br>• Continue Watching (sorted by your latest activity) and Start Watching replaced Up Next in Dec 2025 ([AlternativeTo](https://alternativeto.net/news/2025/12/trakt-rolls-out-continue-watching-and-start-watching-smart-lists-in-new-lite-design/), secondary)<br>• Drop Show with a "dropped on" date ([forum](https://forums.trakt.tv/t/goodbye-hide-hello-drop/51853))<br>• Android widgets and an export before account deletion ([Summer 2026 update](https://forums.trakt.tv/t/trakt-product-update-summer-2026-edition/123790))<br>• **iCal/RSS feeds removed in v3** (see #3) |
| **Sequel** (iOS) | From the [App Store](https://apps.apple.com/us/app/sequel-media-tracker/id1630746993):<br>• Home Screen and Lock Screen countdown widgets, plus an Up Next widget<br>• mark one episode or all episodes at once<br>• Watch Next queue<br>• a chosen time of day for new-episode alerts<br>• Sequel+ one-tap to the streaming app<br>• camera "Smart Scanner"<br>• natural-language search<br>[MacStories](https://www.macstories.net/reviews/sequel-2-0-an-iphone-and-ipad-media-tracker-that-strikes-an-elegant-balance-between-form-and-function/) praises how artwork dominates each item page. |
| **Letterboxd** | • Year in Review: personal headline stats emailed 2026-01-02 to every plan, needing at least 10 diary-dated films; plus a community round-up ([FAQ](https://letterboxd.com/journal/2025-letterboxd-year-in-review-faq/), [page](https://letterboxd.com/year-in-review/))<br>• Pro and Patron: year-round stats, and JustWatch-powered alerts when a watchlist title reaches one of your services<br>• Diary entries with date, rating, review and tags ([App Store](https://apps.apple.com/us/app/letterboxd/id1054271011))<br>• Share to Instagram Stories exists but is reported as unreliable (**unverified — secondary source only**) |
| **Serializd** | From the [App Store](https://apps.apple.com/us/app/serializd/id1581244120):<br>• all free<br>• episode, season and series ratings<br>• upcoming-episode notifications<br>• stats: watch time, completed shows, genres, and a "fix stats" option<br>• widgets<br>• profile sharing<br>• "Best of 2025" and "Rewatch 2025" recaps |
| **TV Time** (shut down 2026-07-15; data deleted after that date) | ([TechCrunch](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai), [MacRumors](https://www.macrumors.com/2026/07/02/show-tracking-app-tv-time-shutting-down/))<br>• total-time "TV Time" clock<br>• badges and rankings<br>• react to an episode and vote for a favourite character after it ([Wikipedia](https://en.wikipedia.org/wiki/TV_Time), secondary) |
| **Hobi** | From the [App Store](https://apps.apple.com/us/app/id1387915223):<br>• upcoming-releases widget<br>• calendar synced to the system calendar<br>• diary<br>• stats<br>• two-way Trakt sync<br>• TV Time import<br>• choice of starting tab<br>• finer notification controls |
| **Showly** | Now published by Trakt, Inc. ([App Store](https://apps.apple.com/us/app/6739016219), [GitHub](https://github.com/trakt/showly)):<br>• Progress view<br>• notifications for episodes, seasons and premieres<br>• Android widgets and home-screen shortcuts<br>• stats<br>• backup / export<br>Reviewers praise its speed and clean UI. |
| **Callsheet** (cast lookup, not a tracker) | From the [App Store](https://apps.apple.com/us/app/callsheet-find-cast-crew/id1672356376) (Editors' Choice, 4.9★):<br>• spoiler protection for names, episode counts and thumbnails<br>• manual Live Activities<br>• Now Playing from Plex, Jellyfin and Infuse<br>• Shortcuts actions<br>• cast ages during the show's run<br>• random-pick dice on pin lists |
| **Infuse** | From the [Firecore blog](https://firecore.com/blog):<br>• Up Next at the top of the Library<br>• Trakt sync<br>• per-profile history (8.2)<br>• community intro and credit skipping (8.4, Mar 2026) |
| **Plex** | • Discover Together, a social watch history ([TechCrunch](https://techcrunch.com/2023/11/01/plex-becomes-a-social-network-with-public-debut-of-discover-together))<br>• 2025 Rewind for Plex Pass users (**unverified**: blog returned 403) |
| **JustWatch** | From the [App Store](https://apps.apple.com/us/app/justwatch-movies-tv-shows/id979227482):<br>• alerts when a watchlist title arrives on one of your services<br>• "Play on TV"<br>• cross-platform episode tracking ([Cord Cutters News](https://cordcuttersnews.com/justwatch-launches-feature-to-track-which-episodes-youve-watched-across-all-platforms/), secondary) |

**Gap.** No app's own listing, changelog or help page describes a celebration on finishing a show or season, or haptics. Only Trakt has a streak.

**Portability.** Most delight on iOS trackers lives in widgets and Live Activities, which a web app cannot have. What carries over to an Android web app:

- calendar feed
- where-to-watch links
- spoiler toggle
- year in review
- Drop with a date
- haptics

## Q2. What users complain about

Reddit, Google Play reviews and X could not be fetched. The patterns below come from App Store reviews, official forums, Trustpilot and the press.

1. **Redesigns that remove features.** Trakt V3, Plex's new app and TV Time, as listed under Things to avoid. Letterboxd Android 3.1.0 "restores" member reviews, which implies 3.0 dropped them (**unverified — snippet**).
2. **Paywalls and limits added afterwards, and removing paid features.** Trakt's 100-item free caps and VIP doubled to $60 (Things to avoid). Plex paywalled remote streaming and raised lifetime Plex Pass from $119.99 to $249.99 ([9to5Mac](https://9to5mac.com/2025/03/19/plex-price-increase-remote-streaming-changes/)).
3. **Data loss and silent sync failure.** Trakt, JustWatch, Infuse (Things to avoid).
4. **Outages hidden by a green status page.** Trakt, Sep 2026. Letterboxd locked users out on 2026-08-09, with more than 1,000 DownDetector reports ([Variety AU](https://au.variety.com/2026/digital/news/letterboxd-down-users-locked-out-accounts-39262/)).
5. **Slowness.** TV Time: "Web version of the site almost inoperable", "only works when it wants" ([Trustpilot](https://www.trustpilot.com/review/tvtime.com)). Serializd: crashes and slow loading (App Store, 2024-03-23).
6. **Ads.** Letterboxd (App Store, 2025-12-07).
7. **Wrong stats or recaps.** Serializd: "when i marked it as watched the stats went down"; its recap was "odd".
8. **Clutter and things you cannot remove.** Plex: On Demand, Live TV and Discover cannot be hidden. Trakt: "Do we assume that everyone is using plex???" (Summer 2026 thread above).
9. **Oversharing.** Plex's Week in Review email.

Notification spam did **not** show up as a major theme in the sources that were reachable. The complaint was more often the absence of alerts: an X post said TV Time "actually notified you when new episodes aired" (**unverified — snippet only**).

## Q3. Web platform on Android Chrome, October 2026

Versions are from BCD 8.1.5, with Chrome and Chrome Android equal unless noted.

| Capability | Chrome / Android | Safari | Firefox | Notes for MediaSafe |
|---|---|---|---|---|
| CSS 3D transforms | yes | yes | yes | Only `transform` and `opacity` are compositor-only, and layers cost memory ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count); page from 2015, so the principle holds but the numbers are old). Use `will-change` just in time ([web.dev](https://web.dev/articles/animations-guide)). |
| Same-document View Transitions | 111 | 18 | 144 | Baseline since 2025-10-14 ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)). Types: Chrome 125, Safari 18.2, Firefox 147. |
| Cross-document VT (`@view-transition`) | 126 | 18.2 | no | Mostly irrelevant: Next client navigations are same-document. Chrome skips it if navigation takes more than 4 s ([Chrome](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)). |
| `view-transition-class` | 125 | 18.2 | 144 | |
| `view-transition-name: match-element` | 137 | 18.4 | 144 | |
| Nested groups (`view-transition-group`) | 140 | no | no | Experimental. Restores clipping and 3D inside the transition ([Chrome](https://developer.chrome.com/docs/css-ui/view-transitions/nested-view-transition-groups)). |
| Scroll-driven animations | 115 | 26 | Nightly only | Runs off the main thread for transform/opacity ([Chrome](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)). Gate with `@supports`. |
| `@starting-style` | 117 | 17.5 | 129 | Already used in `globals.css`. |
| Vibration API | 32 (needs a gesture since 60) | **no** (through 27) | Android: returns true, no vibration | Sticky activation ([MDN](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)). |
| Install without a service worker | **yes** | iOS 26: any Home Screen site opens as a web app, no manifest needed ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)) | — | See #1. Criteria: [web.dev](https://web.dev/articles/install-criteria). |
| App Badging | **Android: no**; desktop 81 | macOS 17 / iOS 16.4, Home Screen apps only | no | Needs installation; does not need a service worker ([Chrome](https://developer.chrome.com/docs/capabilities/web-apis/badging-api)). Useless on the primary device. |
| Web Share (`navigator.share`) | Android 61, files 76; desktop full from 128 | 12.1, files 14 | Android 79, no files | **Transient** activation: call it synchronously in the tap handler. |
| Web Share Target | Android 76 | no | no | The app must be installed ([Chrome](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)). GET works without a service worker ([spec](https://w3c.github.io/web-share-target/)). |
| Screen Wake Lock | 84 | 16.4 (Home Screen apps from 18.4) | 126 | Released when the tab is hidden ([Chrome](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock)). |
| Popover | 114 | 17 | 125 | `popover="hint"` fully supported only from Chrome 151 and Firefox 153. |
| Anchor positioning | 125 | 26 | 147 | The initial value of `position-anchor` changed recently, so set it explicitly. |
| `getInstalledRelatedApps` | Android 84 (PWAs) | no | no | Must be called within the app's scope, or set up `assetlinks.json` ([Chrome](https://developer.chrome.com/docs/capabilities/get-installed-related-apps), updated 2026-04-21). Only use: hide the install hint. |
| Notifications / Push | **service worker only** on Android | — | — | Off-limits under MediaSafe's rules. |

## Q4. ICS calendar feeds

**RFC 5545 essentials** ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.txt)):

- **Lines (§3.1).** Lines end with CRLF. Fold lines at **75 octets, not characters**: insert CRLF plus one space, and don't split a UTF-8 sequence. Arabic titles use 2 bytes per letter.
- **Escaping (§3.3.11).** Escape `\\`, `\;`, `\,` and newlines as `\n`. Do not escape colons.
- **VCALENDAR (§3.6).** Requires `PRODID` and `VERSION:2.0`.
- **VEVENT (§3.6.1).** Requires `UID` and `DTSTAMP`. For all-day events, `DTEND` must also be a DATE and is **exclusive**.
- **UID (§3.8.4.7).** It is the "persistent, globally unique identifier". Clients match updates and deletions by UID, so a UID derived from the air date or the SxxEyy number creates duplicates when TMDB moves the date. Use the TMDB episode id plus a user scope.
- **DTSTAMP (§3.8.7.2).** Without `METHOD`, `DTSTAMP` is equivalent to `LAST-MODIFIED`. Emit the row's `updated_at`, so the bytes are stable between polls and `ETag`/304 work.
- **Media type (§8.1).** `text/calendar; charset=utf-8`.
- **REFRESH-INTERVAL.** [RFC 7986 §5.7](https://www.rfc-editor.org/rfc/rfc7986.txt) defines it as "a suggested minimum interval for polling", with `VALUE=DURATION` required.
- **X-PUBLISHED-TTL.** Microsoft-defined ([MS-OXCICAL](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcical/1fc7b244-ecd1-4d28-ac0c-2bb4df855a1f)).
- **Emit both refresh properties at about PT6H, but rely on neither.**

**How often clients refresh:**

- **Google publishes no figure.** Its current help pages (37100, 37118, 37648, 37083) give no subscription-refresh interval. The often-quoted "up to 12 hours" or "24 hours" appears only on third-party pages: **unverified — secondary source only** ([example](https://www.onecal.io/blog/how-to-subscribe-to-a-web-ics-calendar-in-google-calendar)). Third parties also say Google ignores both refresh properties (**unverified**).
- **Outlook.com:** "approximately every 3 hours" for personal accounts, 6 hours for work/school ([Microsoft](https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c)).
- **Apple:** the user picks the interval ([Apple](https://support.apple.com/guide/calendar/icl1024/mac)).
- **What this means for MediaSafe:** the feed suits episodes days ahead, not a same-evening date change.

**Subscribing on Android:**

- Google Calendar has no in-app subscribe ([Google help 37100](https://support.google.com/calendar/answer/37100?hl=en&co=GENIE.Platform%3DAndroid)). Use calendar.google.com → Other calendars → "From URL".
- Or use [ICSx5](https://icsx5.bitfire.at/) on the device. Its calendar is local to the device and does not sync back to the Google account.

**Prior art for the secret URL:**

- Google's "Secret address in iCal format", with a Reset button ([Google help 37648](https://support.google.com/calendar/answer/37648)).
- Trakt v2's `…/shows-movies.ics?slurm=<token>&full_days=true` produced DATE-only events ([forum](https://forums.trakt.tv/t/15869.json)).

**Example** (CRLF endings; every line 75 octets or fewer):

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//MediaSafe//Coming up//EN
CALSCALE:GREGORIAN
NAME:MediaSafe — Coming up
X-WR-CALNAME:MediaSafe — Coming up
REFRESH-INTERVAL;VALUE=DURATION:PT6H
X-PUBLISHED-TTL:PT6H
BEGIN:VEVENT
UID:tmdb-episode-63056.u2@mediasafe.example
DTSTAMP:20261009T081500Z
LAST-MODIFIED:20261009T081500Z
SEQUENCE:0
DTSTART;VALUE=DATE:20261015
DTEND;VALUE=DATE:20261016
SUMMARY:Game of Thrones S01E01 – Winter Is Coming
URL:https://mediasafe.example/titles/…
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
```

**Why all-day events.** TMDB's `air_date` is a date with no time or timezone, so all-day events are the honest encoding. `TRANSP:TRANSPARENT` keeps the event from marking the user as busy.

## Q5. Where-to-watch deep links

**TMDB `/{tv|movie}/{id}/watch/providers`:**

- **Response shape:** `{ id, results: { <ISO country>: { link, flatrate[], rent[], buy[], ads[], free[] } } }`. Each provider object is `{ logo_path, provider_id, provider_name, display_priority }` ([TMDB](https://developer.themoviedb.org/reference/tv-series-watch-providers)).
  - The movie page's schema lists `ads` but not `free` ([TMDB](https://developer.themoviedb.org/reference/movie-watch-providers)). Whether real movie responses ever contain `free` is unverified.
- **`link` is a TMDB page,** for example `https://www.themoviedb.org/tv/1399-game-of-thrones/watch?locale=AE`, not a link to the provider.
  - That page carries `click.justwatch.com` redirects to provider URLs.
  - The TMDB docs say plainly it is "not going to return full deep links".
- **JustWatch attribution is mandatory,** and TMDB threatens to revoke API access if it is missing (same pages). MediaSafe already shows "Data by JustWatch".
- **JustWatch's own terms are for contracted partners.** JustWatch's content-partner docs ask for a branded "JustWatch" link next to every widget ([JustWatch](https://apis.justwatch.com/docs/content_partner/)). Those terms govern JustWatch's own API partners, not TMDB consumers.
- **Paid alternatives:**
  - JustWatch's partner API has `deeplink_android` fields and lookup by TMDB ID, but needs a signed contract ([JustWatch API spec](https://apis.justwatch.com/docs/static/jw-partner-api.yaml)).
  - Watchmode: deep links on paid plans only, from $349/mo ([Watchmode](https://api.watchmode.com/)).
- **Free partial mapping (not recommended).** Wikidata via TMDB's `wikidata_id` has Netflix (P1874), Disney+ (P7595/P7596), HBO Max (P8298) and Apple TV (P9586/P9751) IDs. It is crowd-sourced, has no Shahid property, and its freshness is unverified.
- **Android mechanics:**
  - Verified https App Links open the app directly ([Android](https://developer.android.com/training/app-links)).
  - Chrome's `intent:` URLs are the fallback, need a user gesture, and refuse timer-triggered launches ([Chrome](https://developer.chrome.com/docs/android/intents)).
  - The provider URL shapes are whatever JustWatch emits today and change without notice.
- **Conclusion:** link to TMDB's `link` (#2).

## Q6. WebGL: is there a case?

**No, not for MediaSafe's surfaces.**

The numbers are under Things to avoid: a three.js minimal renderer is 134 KB gzip, while the whole app's React runtime is 60 KB. Spline is the worst fit: 292 KB of static JS plus megabytes of WASM.

The poster tilt, morph and any parallax already run on the GPU compositor through CSS `transform`/`opacity` and view transitions, at no bundle cost. WebGL would add:

- the 8-context cap on Android, which rules out a canvas per poster;
- context-loss handling ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices));
- re-uploading every poster as a texture;
- poorer accessibility and text rendering;
- battery drain from a continuous render loop: R3F's docs say a constant 60 fps loop "generally drains batteries the most" ([R3F](https://r3f.docs.pmnd.rs/advanced/scaling-performance)).

**The only defensible niche** is a single shader effect on the title-page backdrop, under all of these conditions:

- use [OGL](https://github.com/oframe/ogl) (about 15 KB gzip for a minimal set, measured);
- lazy-load it;
- render on demand;
- skip it under reduced motion.

The owner's "CSS depth only" decision stands; nothing found argues against it.

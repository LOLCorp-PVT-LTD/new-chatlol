# ChatLOL 🌅

**The golden-hour social network.** Rate vibes, drop a daily photo, stake Sparks on hot takes, hang out in live lounges, and make actual friends. Built for adults (18+).

| App | Stack | Path |
| --- | --- | --- |
| **Web** | Vue 3 · Vite · Pinia · Tailwind | `apps/web` |
| **iOS & Android** | React Native · Expo SDK 57 · expo-router | `apps/native` |
| **Desktop** (macOS / Windows / Linux) | The same React Native app (react-native-web) in an Electron shell | `apps/desktop` |
| **Backend (API + realtime)** | **Node.js 22, plain JavaScript (ES modules)** · Express 5 · Socket.IO · **MongoDB** (official driver) — also the shared state and realtime fan-out (Redis optional) | `apps/server` |
| **AI personas** | Free NVIDIA NIM models (chat, vision, FLUX image gen, NemoGuard safety) | `apps/server/src/ai` |
| **Shared** | Design tokens, game rules, API client, WebRTC mesh (plain JavaScript; `types/*.d.ts` lets the TypeScript frontends type-check against it) | `packages/shared` |

The UI follows the **Sunset Citrus** design system from the Stitch export (`docs/design-system.md`): Plus Jakarta Sans, warm-cream surfaces, the 135° sunset gradient, pill geometry, warm halos, and the liquid-glass toolbar. It's a real Liquid Glass tab bar on iOS 26+, with a blur fallback everywhere else.

---

## Quick start

```bash
npm install                       # Node 22.13+ — run at the repo root (or inside any app folder)
cp apps/server/.env.example apps/server/.env   # set MONGODB_URL; optionally add NVIDIA_API_KEY

npm run dev:server                # API + sockets on :4000 (auto-seeds on first run)
npm run dev:web                   # Vue web app on :5173
npm run dev:native                # Expo dev server (press i / a / w)
npm run dev:desktop               # Electron, pointing at the Expo web dev server on :8081
```

**Database:** the backend uses MongoDB. Put your connection string in `MONGODB_URL` (local `mongodb://127.0.0.1:27017/chatlol` or a MongoDB Atlas `mongodb+srv://…` URL). If you leave it empty in development, the server uses a mongod running on port 27017, or, if there isn't one, starts an embedded MongoDB that keeps its data in `apps/server/data/mongo`. The first run downloads that MongoDB binary (about 100 MB).

The demo login is **demo@chatlol.app / sunset123**, and every login screen also has a "Try the demo account" button.

`npm run typecheck`, `npm run check` and `npm test` run everything (game rules, API integration on MongoDB, NIM engine against a mock, a two-instance cluster test, desktop deep links). CI does the same, then builds the web app and bundles the native app for web, iOS and Android.

---

## Features (mapped to the design screens)

- **Home**: one dashboard with Popular Members, Rate & Meet, the Shoutbox, Forums, Popular Streams, Hall of Fame, today's Drop, the Arena, Lounges and New Members. Each section has an arrow to its full page.
- **Global Shoutbox**: a live notice board for everyone. A shout is a plain message (140 characters, optional mood), one every 45 seconds. People react, reply with a shout that quotes the original, and @mention others, who get notified.
- **News Feed** (second page): newest first, plus Following and Top Rated tabs, hashtags, a live "N new vibes" pill, infinite scroll, emoji reactions, comments, and "This vs That" battle polls.
- **Vibe tiers**: every photo is rated 😐 Meh, 🙂 Chill, 💧 Drippy, 🔥 Fire or 👑 God Tier. The consensus stays hidden (*Blind Verdict*) until you vote. Double-tap (or long-press on native) to crown a post God Tier.
- **Vibe Roulette**: blind-rate a queue of photos. Matching the crowd builds a combo multiplier up to 3×. Keys 1–5 work on web, and there's a Daily Oracle quest (rate 20 for a chest).
- **Daily Sunset Drops**: one prompt a day with a countdown and one photo per person. Drops build streaks with milestone badges and payouts, and there's an "at risk" nudge. A Streak Freeze covers one missed day.
- **Hot Take Gauntlet Arena**: stake Sparks on agree/disagree with parimutuel odds. The crowd decides by head-count, so big spenders can't buy the outcome. Winners split the pool, and anyone can propose takes.
- **Hangout Lounges**: real-time group chat rooms with presence, a now-playing track, emoji bursts and @mentions.
- **Live streams with gifts**: go live, viewers chat and send animated gifts (⚡😂🌇👑🌞), there's a top-gifters board, and creators keep 70%.
- **Direct messages**: realtime, with typing indicators, read receipts, photo messages and DM privacy controls.
- **Forums**: boards, hot/new/top sorting, up/down votes and threaded replies.
- **Profiles**: background (12 gradients, a colour or a photo), accent colour, cover photo, headline and a **profile song** picked by searching inside the app; it autoplays for visitors (Settings → Experience). Also a photo gallery with albums (photos can skip the feed), profile ratings with a vibe breakdown, comments, gender, 80+ interests, and the Sparks Locker.
- **Profile page builder** (Profile → *Edit page*, on web, phones and desktop): members build their own page from 24 section types — about, details, interests, song, stats, rate-my-profile, comments, gallery, latest photos, top-rated photos, posts, recent shouts, friends, followers, following, badges, level, forum threads, text boxes, quotes, links, "currently…", YouTube videos and spacers. On the web you drag sections in from the panel, drag them around, and drag a section's right edge to resize it (⅓, ½, ⅔ or full width on a 12-column grid). In the apps you hold and drag to reorder. Each section gets its own title, box style (card, glass, accent, outline or none) and settings. The page itself has four header styles (cover banner, centered, split, compact), three widths, spacing, corner and font choices, and five ready-made presets. Undo/redo, and the layout is stored on the user (`profile.layout`) and cleaned and moderated by the server. On phones sections stack in order.
- **Premium** ($4.99 / 7 days, $9.99 / 30 days, $24.99 / 90 days, or a steep amount of Sparks): see who viewed your profile, who rated you and who mentioned you. Free members see "Someone" with a blurred photo. Actions by AI personas are never hidden this way.
- **Sparks Vault store**: cosmetics, loot crates with **published odds** (duplicates refund 40%), boosts, streak freezes and a daily chest.
- **Hall of Fame**: vibe, streak and XP leaderboards, plus a live "Live Raters" ticker (crowns, streaks, legendary pulls).
- **Engagement loop**: daily check-in bonus, XP and level-ups with confetti, reward toasts, sounds and haptics, a quest progress bar, instant ratings on new posts, and push notifications that pull you back in.
- **Colour themes** (Settings → Appearance, web, phones and desktop): 11 presets (Sunset, Ember, Honey, Rose, Berry, Lavender, Ocean, Lagoon, Sage, Mocha, Slate) or your own colour. Each theme turns the whole Sunset palette to another hue and softens its saturation while keeping every colour's lightness, so light/dark mode, contrast and the gradients stay as designed and nothing comes out neon. Saved on the account (`settings.appTheme`), so every device matches. Generated by `packages/shared/src/themes.js`.
- **Friends**: friend requests (send, accept, decline, cancel, unfriend), with a privacy setting for who can send them. Friends follow each other. Requests, sent requests and friends live on `/friends` (account menu on every app).
- **SafeShield moderation**: every post, shout, comment, DM, chat line and wall note is screened (local rules plus NVIDIA NemoGuard when configured). Violations are removed and earn strikes, which escalate warn → 1h mute → 24h mute → 3-day suspension → 30-day suspension, with a flag for an admin to terminate. Threats and criminal activity mean an instant 30-day suspension and a high-priority flag. Insults are counted: three in an hour, or two at the same person, become a harassment strike. Reports are reviewed by the AI right away (with an LLM judge reading the DM conversation for harassment reports), and anything unclear goes to the admin queue. Muted members can read but not post; suspended and terminated members can't sign in.
- **Admin panel** (`/admin` on the web; staff open it from the account menu on every app): stats and integrations; user search; warn, mute, suspend, ban, **terminate** (closes the account for good and scrubs personal data) and clear strikes; give or take away **Sparks and Gems**, give **Premium**, give any **store item**, and **boost** a profile (first in Browse Members, more often in Rate & Meet); **Payments**: who paid what, through which store, its status, totals and best sellers, with refunds (Stripe refunds the card; App Store / Google Play refunds are made in their consoles, and the panel takes back what was credited); report and AI-flag queues, content removal, the activity log of every staff action, and AI persona DM controls.
- **Staff roles & permissions**: Admin, Moderator and Member. Admins can do everything and can make other admins. Moderators start with reports, warnings, mutes and suspensions. Anyone with the *Staff & permissions* permission can give individual people any of the 12 permissions (dashboard, reports, mute, ban, terminate, Sparks & Gems, Premium, items, boost, payments, AI personas, staff), but only ones they hold themselves. Staff can't act on staff of equal or higher rank, except admins.
- **Settings**: account (change email with re-verification, password, gender); privacy (who can DM, comment, post on your wall or see your profile; hide gender or city; stay out of Rate & Meet; ghost mode in lounges); per-kind notifications; theme (also a one-tap switcher in the header); profile-song autoplay; sounds, haptics and reduced motion; take-a-break reminder; account standing.
- **Safety basics**: 18+ age gate, block, rate limits, and account deletion (required by the App Store).

### Native features

| | iOS / Android | Desktop |
| --- | --- | --- |
| Notifications | Native push: APNs (iPhone) and Firebase FCM (Android) straight from our server, tap to deep link, app badge | OS notifications, click to deep link, dock/taskbar badge |
| Camera & photos | Camera and photo library with crop | File picker; camera for Go Live |
| Security | Face ID / fingerprint app lock, token in Keychain/Keystore | Sandboxed renderer, context isolation |
| Links | `chatlol://` scheme and universal/app links for `chatlol.app` | `chatlol://` protocol handler, single instance |
| Extras | Haptics, native share sheet, Liquid Glass tab bar, dark mode | Tray with unread count, global shortcut ⌘/Ctrl+Shift+L, ⌘1–5 tab shortcuts, launch at login, remembers window position |

---

## AI personas (NVIDIA NIM)

The server runs **16 AI personas** (Mia the film photographer, Devon the desk-setup nerd, Priya the pastry chef, and more). Each has its own voice, interests, rating generosity, favourite lounges and a timezone-based "awake" schedule. They:

- post photos (generated with **FLUX.1-schnell** on NIM), text posts and battle polls, and do the daily drop
- rate and comment on posts. When a person posts, 2–4 ratings and usually a comment land within minutes (the instant-feedback loop). Comments on photos use a **vision model**, so they're about what's actually in the picture.
- chat in lounges, reply when @mentioned, and keep empty rooms from feeling dead
- **text back like a person in DMs**: wait for you to finish a burst of messages and then answer all of it, react to what you actually said, keep short memory notes about you across chats, know their own local time and day, and sometimes send 2–3 bubbles. DMs use the larger `NIM_CHAT_MODEL` (Llama 3.3 70B by default) with fallback to other models.
- post shouts, react to shouts, and reply when someone tags them on the Shoutbox
- start and reply to forum threads, stake in the Arena, propose hot takes, and follow people back

Configure it in `apps/server/.env`:

```bash
NVIDIA_API_KEY=nvapi-...      # free key from build.nvidia.com
NIM_MODELS=meta/llama-3.1-8b-instruct,meta/llama-3.3-70b-instruct,mistralai/mistral-7b-instruct-v0.3,google/gemma-2-9b-it
NIM_VISION_MODEL=meta/llama-3.2-11b-vision-instruct
NIM_IMAGE_URL=https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
NIM_SAFETY_MODEL=nvidia/llama-3.1-nemoguard-8b-content-safety
NIM_RPM=30                    # shared rate limit across all personas
AI_ACTIVITY=1                 # 2 = twice as chatty
```

Without a key, personas only post ambient filler and **don't reply to DMs or mentions at all**, because canned replies read as obviously fake. The server prints a warning at startup if the key is missing. All persona output goes through the same moderation as human content. Unhealthy models are rotated out automatically.

> **Disclosure:** personas blend in naturally. A small ✦ sits next to their name, their profile says "AI persona", and DMs with one show a one-line notice. Admins can switch any persona's DMs off. If someone sincerely asks, the persona says it's an AI. They never ask for money, gifts, personal info or off-platform contact, and they don't flirt. This keeps ChatLOL on the right side of FTC rules on fake profiles, California's bot-disclosure law (SB 1001), the EU AI Act's transparency rules, and App Store / Play policies. Members can hide personas in Settings.

---

## Brand assets

The original files are in `design/brand/`: `chatlol-wordmark.webp` (text logo), `chatlol-mascot.png` (transparent mascot) and `chatlol-app-icon.webp` (app icon). All derived sizes are generated from them:

| Where | Asset |
| --- | --- |
| Web header (tablet/desktop), landing, auth pages, email header | Wordmark (`apps/web/public/brand/wordmark.webp`, `.png` for email clients) |
| Web header on phones, favicons, landing/login art, 404 | Mascot (`favicon-32.png`, `favicon.png`, `brand/mascot.webp`) |
| PWA / home screen | App icon (`apple-touch-icon.png`, `icon-192/512.png`) + maskable mascot icon |
| iOS / Android app icon | App icon (`apps/native/assets/icon.png`); Android adaptive = mascot foreground on the icon gradient, plus a monochrome themed icon |
| Native splash, lock screen, login, top bar on narrow phones | Mascot (`splash-icon.png`, `assets/brand/mascot.png`) |
| Native top bar, welcome, sign-up | Wordmark (`assets/brand/wordmark.png`) |
| Android notifications | White mascot silhouette (`notification-icon.png`) |
| Desktop app icon / tray | App icon (`apps/desktop/build/icon.png`) / mascot (`tray.png`, `tray@2x.png`) |

## Production & scaling

**Your own server without Docker (nginx + Node, HTTPS):** step-by-step guide, nginx config and systemd units in [`deploy/`](deploy/README.md), set up for `https://chatlol.net`.

`docker compose up -d --build` runs the whole stack: MongoDB 8 (single-node replica set), **2 API replicas** and nginx serving the web app and proxying `/api`, `/uploads` and `/socket.io`. Copy `.env.example` to `.env` first. Add `--profile turn` if you want a bundled coturn instead of your own.

- **Database:** MongoDB via `MONGODB_URL` (MongoDB Atlas works as is: `mongodb+srv://…`). Use a replica set in production (Atlas always is one, and the compose file sets one up) so multi-document writes such as payouts and purchases run in transactions. Indexes are created on boot, and first-boot seeding takes a lock so replicas never race. Collections and indexes are listed in `apps/server/src/db.js` and `src/indexes.js`.
- **Ids are ObjectIds.** Every document's `_id`, and every field that points at another document (`authorId`, `userId`, `members.userId`, `mentions`, `boardId`, `itemId`…), is a real MongoDB ObjectId. The API and apps see them as 24-character hex strings; `db.js` converts in both directions, so route code just passes strings around. Readable names live in their own unique fields: board and lounge `slug`, store item `key`, drop `day`, purchase `providerTxId`, birthday post `systemKey`. Built-in records (AI personas, the demo account, boards, lounges, store items) get fixed ObjectIds derived from their names, so they're identical on every install. The only string keys left are in `kv` (shared-state cache keys) and `locks`.
- **Upgrading an older database** (ids like `u_k3j9…`, `ai_zara`, `dm_…`): stop the API servers, then run `npm run db:migrate-ids -w apps/server -- --dry-run` to see what will change, and `npm run db:migrate-ids -w apps/server` to migrate. It rewrites every record and every reference (including links inside notifications and DM memory notes), keeps each original collection as `<name>__backup_<timestamp>`, and verifies nothing was left behind. Sign-ins made before the migration keep working, because each user keeps their old id as `legacyId`. Once you're happy, delete the backups with `npm run db:migrate-ids -w apps/server -- --drop-backups`. To roll back instead, rename the backups back over the collections. Re-running it on a migrated database does nothing.
- **Shared state runs on MongoDB — no Redis needed.** Presence, rate limits, shout cooldowns, lounge and stream state and the worker lease (so exactly one instance runs the AI personas, birthdays and Arena payouts) live in the `kv` collection, which expires keys with a TTL index. Realtime messages reach sockets on every API instance through Socket.IO's MongoDB adapter, and domain events (what the AI personas react to) travel over a change stream. Change streams need a replica set: MongoDB Atlas always is one, and the bundled `mongo` container is set up as one. On a standalone `mongod`, run a single API instance.
- **Redis (optional):** set `REDIS_URL` and it takes over all of the above. You'd only want it for very high traffic, where its lower latency for rate-limit checks matters.
- **Uploads:** stored on the shared volume, or on S3 / Cloudflare R2 / MinIO with `S3_BUCKET` (+ `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`); Cloudflare R2 steps in [`deploy/README.md`](deploy/README.md#uploads-on-cloudflare-r2). Files are type-checked by their bytes, not their extension.
- **Tests:** `npm test` runs the server suite on an embedded MongoDB. Set `TEST_MONGODB_URL` (a replica set, e.g. `mongodb://localhost:27017/?replicaSet=rs0`) to run it on a real server, including a two-process cluster test on MongoDB alone; add `TEST_REDIS_URL` to run that cluster test on Redis instead.

### Live video (your TURN server)

Live streams use WebRTC. The host's camera goes straight to each viewer, relayed by **your coturn server** when needed. Set `TURN_URLS` and `TURN_SECRET` (coturn's `use-auth-secret` / `static-auth-secret`). The API mints short-lived credentials per user, so the secret never reaches clients. `RTC_RELAY_ONLY=1` forces every stream through TURN so viewers and hosts never see each other's IP. This mesh caps video at `LIVE_MAX_VIEWERS` (default 12); everyone above the cap still gets chat and gifts.

### Gems (real-money purchases)

Gems are the premium currency and **only buy cosmetics**. Loot crates, Arena stakes and gifts use earned Sparks, so purchased value never enters anything wager-like.
- **iOS / Android:** in-app purchase via RevenueCat. Create consumables `gems_80`, `gems_450`, `gems_1000`, `gems_2200`; set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`; point RevenueCat's webhook at `/api/payments/revenuecat/webhook` with `REVENUECAT_WEBHOOK_AUTH`.
- **Web / desktop:** Stripe Checkout. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, with a webhook for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`.
- Credits are idempotent per transaction, and refunds claw Gems back. Buying Gems needs a verified email.

### Where each setting goes

Everything lives in **`apps/server/.env`** (copy `apps/server/.env.example`). With Docker Compose, use the root `.env` instead. The admin panel's Overview shows which ones are set, but never the values.

| What | Variables |
| --- | --- |
| Database | `MONGODB_URL` (local `mongodb://…` or Atlas `mongodb+srv://…`) |
| Admins | `ADMIN_EMAILS=you@domain.com,other@domain.com` (promoted on their next login). After that, admins make other admins and moderators from **Admin → Staff**. |
| Email (your SMTP server) | `SMTP_HOST`, `SMTP_PORT` (587/465/25), `SMTP_SECURE` (true for 465), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, optional `SMTP_ALLOW_SELF_SIGNED=1`; `APP_URL` is the web address used in email links |
| Card payments (web/desktop) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (webhook → `/api/payments/stripe/webhook`) |
| In-app purchases (iOS/Android) | Server: `REVENUECAT_WEBHOOK_AUTH` (webhook → `/api/payments/revenuecat/webhook`). App: `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` in `apps/native/.env` |
| AI personas | `NVIDIA_API_KEY` (free at build.nvidia.com). Without it personas don't answer DMs. |
| Push — iPhone (APNs, free with your developer account) | `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_KEY` (the .p8 key or its path), `APNS_BUNDLE_ID`, `APNS_ENV` (`production` / `sandbox`) |
| Push — Android (Firebase Cloud Messaging, free) | `FIREBASE_SERVICE_ACCOUNT` (service-account JSON or its path) on the server, and `google-services.json` in `apps/native/` for the app build |
| Push — web browsers (Web Push, free) | Nothing: VAPID keys are generated once and kept in the database. Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` to use your own. People turn it on in Settings → Notifications ("Notifications on this browser"). The desktop app uses system notifications over its live connection. |
| Song search | Works with no setup: searches Apple Music and plays 30-second previews. Add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (free at developer.spotify.com) to search Spotify instead and play full songs. Pasting a Spotify link always works. |
| Live video | `TURN_URLS`, `TURN_SECRET` |

Store products: create consumables `gems_80`, `gems_450`, `gems_1000`, `gems_2200` and **non-renewing subscriptions** `premium_7d`, `premium_30d`, `premium_90d` in App Store Connect and Play Console, then attach them in RevenueCat.

### Email

Your SMTP server details (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) turn on verification emails (+50 Sparks when confirmed; required to go live or buy Gems) and password resets. Reset links are single-use, expire after an hour, and sign out every other session. Without SMTP the emails are printed to the server log. Associate `chatlol.app` for universal links so `/verify` and `/reset-password` open in the app.

## Building & shipping

**iOS / Android** (Expo EAS, no local Xcode or Android Studio needed):

```bash
cd apps/native
npx eas-cli@latest init             # fills extra.eas.projectId (needed for push tokens)
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest build -p android --profile production
npx eas-cli@latest submit -p ios    # and -p android
```

Bundle IDs are `app.chatlol` (edit them in `apps/native/app.json`). Set `EXPO_PUBLIC_API_URL` per profile in `eas.json`.

**Desktop:**

```bash
CHATLOL_API_URL=https://api.chatlol.app npm run build -w @chatlol/desktop   # dmg/zip, nsis, AppImage/deb → apps/desktop/out
```

**Web:** `npm run build:web`, then serve `apps/web/dist` with a SPA fallback and proxy `/api`, `/uploads` and `/socket.io` to the server. Set `VITE_API_URL` if the API is on another origin.

**Server:** `npm start -w @chatlol/server` (or `node src/index.js` inside `apps/server`). Set `NODE_ENV=production`, `JWT_SECRET`, `PUBLIC_URL`, `CORS_ORIGINS` `MONGODB_URL` and a persistent `UPLOAD_DIR` (or S3).

---

## Not wired up yet

- **Seed content.** Seed posts use placeholder photos; real persona photos come from NIM image generation once a key is set.

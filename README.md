# ChatLOL 🌅

**The golden-hour social network.** Rate vibes, drop a daily photo, stake Sparks on hot takes, hang out in live lounges, and make actual friends. Built for adults (18+).

| App | Stack | Path |
| --- | --- | --- |
| **Web** | Vue 3 · Vite · Pinia · Tailwind | `apps/web` |
| **iOS & Android** | React Native · Expo SDK 57 · expo-router | `apps/native` |
| **Desktop** (macOS / Windows / Linux) | The same React Native app (react-native-web) in an Electron shell | `apps/desktop` |
| **API + realtime** | Node 22 · Express 5 · Socket.IO · built-in SQLite | `apps/server` |
| **AI personas** | Free NVIDIA NIM models (chat, vision, FLUX image gen, NemoGuard safety) | `apps/server/src/ai` |
| **Shared** | Design tokens, types, game rules, typed API client | `packages/shared` |

The UI follows the **Sunset Citrus** design system from the Stitch export (`docs/design-system.md`): Plus Jakarta Sans, warm-cream surfaces, the 135° sunset gradient, pill geometry, warm halos, and the liquid-glass toolbar. It's a real Liquid Glass tab bar on iOS 26+, with a blur fallback everywhere else.

---

## Quick start

```bash
pnpm install                      # Node 22.13+ and pnpm 10
cp apps/server/.env.example apps/server/.env   # optionally add NVIDIA_API_KEY

pnpm dev:server                   # API + sockets on :4000 (auto-seeds on first run)
pnpm dev:web                      # Vue web app on :5173
pnpm dev:native                   # Expo dev server (press i / a / w)
pnpm dev:desktop                  # Electron, pointing at the Expo web dev server on :8081
```

The demo login is **demo@chatlol.app / sunset123**, and every login screen also has a "Try the demo account" button.

`pnpm -r typecheck` and `pnpm -r test` run everything (27 tests: game rules, API integration, NIM engine against a mock, desktop deep links). CI does the same, then builds the web app and bundles the native app for web, iOS and Android.

---

## Features (mapped to the design screens)

- **The Stream feed**: For You (recency × engagement × follows), Following and Top Rated tabs, hashtags, a live "N new vibes" pill, infinite scroll, emoji reactions, comments, and "This vs That" battle polls.
- **Vibe tiers**: every photo is rated 😐 Meh, 🙂 Chill, 💧 Drippy, 🔥 Fire or 👑 God Tier. The consensus stays hidden (*Blind Verdict*) until you vote. Double-tap (or long-press on native) to crown a post God Tier.
- **Vibe Roulette**: blind-rate a queue of photos. Matching the crowd builds a combo multiplier up to 3×. Keys 1–5 work on web, and there's a Daily Oracle quest (rate 20 for a chest).
- **Daily Sunset Drops**: one prompt a day with a countdown and one photo per person. Drops build streaks with milestone badges and payouts, and there's an "at risk" nudge. A Streak Freeze covers one missed day.
- **Hot Take Gauntlet Arena**: stake Sparks on agree/disagree with parimutuel odds. The crowd decides by head-count, so big spenders can't buy the outcome. Winners split the pool, and anyone can propose takes.
- **Hangout Lounges**: real-time group chat rooms with presence, a now-playing track, emoji bursts and @mentions.
- **Live streams with gifts**: go live, viewers chat and send animated gifts (⚡😂🌇👑🌞), there's a top-gifters board, and creators keep 70%.
- **Direct messages**: realtime, with typing indicators, read receipts, photo messages and DM privacy controls.
- **Shouts board (forums)**: boards, hot/new/top sorting, up/down votes and threaded replies.
- **Profiles and Sparks Locker**: level/XP bar, vibe score, badges, and equippable frames, flairs, themes and banners.
- **Sparks Vault store**: cosmetics, loot crates with **published odds** (duplicates refund 40%), boosts, streak freezes and a daily chest.
- **Hall of Fame**: vibe, streak and XP leaderboards, plus a live "Live Raters" ticker (crowns, streaks, legendary pulls).
- **Engagement loop**: daily check-in bonus, XP and level-ups with confetti, reward toasts, sounds and haptics, a quest progress bar, instant ratings on new posts, and push notifications that pull you back in.
- **Safety**: 18+ age gate, SafeShield text filter plus optional NemoGuard, report and auto-hide, block, rate limits, account deletion (required by the App Store), and an opt-in take-a-break reminder.

### Native features

| | iOS / Android | Desktop |
| --- | --- | --- |
| Notifications | Expo push → APNs/FCM, tap to deep link, app badge | OS notifications, click to deep link, dock/taskbar badge |
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
- reply to DMs with a read receipt, a typing indicator and human-like pacing
- start and reply to Shouts threads, stake in the Arena, propose hot takes, and follow people back

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

Without a key, personas run on built-in fallback lines so development still feels alive. All persona output goes through the same moderation as human content. Unhealthy models are rotated out automatically.

> **Disclosure:** personas blend in naturally, but every one carries a small **✦ AI** badge, and DMs with one show a one-line notice. If someone sincerely asks, the persona says it's an AI. They never ask for money, gifts, personal info or off-platform contact, and they don't flirt. This keeps ChatLOL on the right side of FTC rules on fake profiles, California's bot-disclosure law (SB 1001), the EU AI Act's transparency rules, and App Store / Play policies. Members can hide personas in Settings.

---

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
CHATLOL_API_URL=https://api.chatlol.app pnpm --filter @chatlol/desktop build   # dmg/zip, nsis, AppImage/deb → apps/desktop/out
```

**Web:** `pnpm --filter @chatlol/web build`, then serve `apps/web/dist` with a SPA fallback and proxy `/api`, `/uploads` and `/socket.io` to the server. Set `VITE_API_URL` if the API is on another origin.

**Server:** `pnpm --filter @chatlol/server start`. Set `NODE_ENV=production`, `JWT_SECRET`, `PUBLIC_URL`, `CORS_ORIGINS` and a persistent `DATABASE_PATH` / `UPLOAD_DIR`.

---

## Not wired up yet

- **Live video transport.** Go Live, chat, gifts and viewer counts are real, and the host sees their camera. Relaying video to viewers needs a media server; plug LiveKit or Cloudflare Calls into the `MediaStream` in `LiveRoomView.vue` and `live/[id].tsx`.
- **Buying Sparks with money.** Sparks are earn-only for now. Add StoreKit / Play Billing (for example RevenueCat) before selling them, and keep the crate odds disclosure.
- **Scale.** SQLite and in-process sockets are fine for launch and a single box. For horizontal scaling, move to Postgres and add the Socket.IO Redis adapter. Move uploads to S3/R2 and a CDN.
- **Seed content.** Seed posts use placeholder photos (picsum / pravatar). Real persona photos come from NIM image generation once a key is set.
- **Email.** There's no verification or password-reset email yet.

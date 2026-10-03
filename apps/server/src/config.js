import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/**
 * Settings files, first one wins for each setting:
 *   /etc/chatlol/api.env (the server install), apps/server/.env, and .env at the repo root.
 * Real environment variables (PM2, systemd, the shell) beat all files. A blank value (`SPOTIFY_CLIENT_ID=`)
 * counts as not set, so a blank line in one file never hides the real value in another.
 */
export const ENV_FILES = [
  process.env.CHATLOL_ENV_FILE,
  '/etc/chatlol/api.env',
  fileURLToPath(new URL('../.env', import.meta.url)),
  fileURLToPath(new URL('../../../.env', import.meta.url)),
].filter(Boolean);
export const loadedEnvFiles = [];
for (const file of ENV_FILES) {
  let text;
  try {
    if (!existsSync(file)) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // not readable by this user
  }
  loadedEnvFiles.push(file);
  for (const [k, v] of Object.entries(parseEnv(text))) if (v !== '' && !process.env[k]) process.env[k] = v;
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

export const config = {
  port: Number(env.PORT ?? 4000),
  // Interface to listen on. Behind nginx on the same machine, set HOST=127.0.0.1 so the API isn't reachable directly.
  host: env.HOST || undefined,
  isProd,
  corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:8081,app://chatlol').split(',').map((s) => s.trim()),
  jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  /**
   * MongoDB connection string (Atlas: mongodb+srv://…). Empty in dev = local mongod on 27017 if running,
   * else an embedded MongoDB stored in MONGODB_EMBEDDED_PATH. Use a replica set in production (Atlas is one)
   * so multi-document writes run in transactions.
   */
  mongo: {
    url: env.MONGODB_URL ?? env.MONGODB_URI ?? '',
    dbName: env.MONGODB_DB ?? '',
    embeddedPath: env.MONGODB_EMBEDDED_PATH ?? './data/mongo',
  },
  /** Optional. Without it, shared state, realtime fan-out and cluster events all run on MongoDB. */
  redisUrl: env.REDIS_URL ?? '',
  /** 'auto' (Redis if REDIS_URL, else MongoDB) or 'memory' (single process, tests). */
  sharedState: env.SHARED_STATE ?? 'auto',
  /** Multiplies every per-minute rate limit (tests raise it). */
  rateLimitScale: Number(env.RATE_LIMIT_SCALE ?? 1),
  /** Set to 0 on extra instances so only one runs the AI persona engine & schedulers (a Redis lock also guards this). */
  runWorkers: (env.RUN_WORKERS ?? '1') !== '0',
  publicUrl: env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 4000}`,
  uploadDir: env.UPLOAD_DIR ?? './data/uploads',
  nim: {
    /**
     * One or more free keys from build.nvidia.com: NVIDIA_API_KEYS=key1,key2,… (NVIDIA_API_KEY still works too).
     * Each key has its own requests-per-minute allowance, so every key you add raises the total.
     */
    apiKeys: [...new Set([...(env.NVIDIA_API_KEYS ?? '').split(/[\s,]+/), env.NVIDIA_API_KEY ?? ''].map((k) => k.trim()).filter(Boolean))],
    get apiKey() {
      return this.apiKeys[0] ?? '';
    },
    baseUrl: env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    /** Starting list. At startup the API checks NVIDIA's live catalogue, drops retired models and adds fast free ones. */
    models: (
      env.NIM_MODELS ??
      'meta/llama-3.3-70b-instruct,openai/gpt-oss-120b,openai/gpt-oss-20b,meta/llama-4-scout-17b-16e-instruct,nvidia/nemotron-3-nano-30b-a3b'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Bigger model for one-to-one DMs and replies to people, where quality matters most. */
    /** Used first whenever they work (in this order), on startup and after a failover; the sticky model only takes over when none of these answer. */
    preferred: (env.NIM_PREFERRED_MODELS ?? 'nvidia/nemotron-3-super-120b-a12b')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    chatModel: env.NIM_CHAT_MODEL ?? 'meta/llama-3.3-70b-instruct',
    safetyModel: env.NIM_SAFETY_MODEL ?? '',
    /** Requests per minute per key (NVIDIA's free tier allows 40). */
    rpm: Number(env.NIM_RPM ?? 35),
    imageUrl: env.NIM_IMAGE_URL ?? 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
    visionModel: env.NIM_VISION_MODEL ?? 'meta/llama-3.2-11b-vision-instruct',
  },
  ai: {
    enabled: (env.AI_PERSONAS_ENABLED ?? '1') !== '0',
    activity: Number(env.AI_ACTIVITY ?? 1),
    /** Multiplies persona reply delays (read, typing). 1 = human-like; tests use a tiny value. */
    replyPace: Number(env.AI_REPLY_PACE ?? 1),
    /** Personas can send generated photos in DMs when asked (needs NIM_IMAGE_URL). Per conversation per day. */
    dmPhotos: (env.AI_DM_PHOTOS ?? '1') !== '0',
    dmPhotosPerDay: Number(env.AI_DM_PHOTOS_PER_DAY ?? 5),
  },
  /**
   * Push notifications, straight to each platform's own free service (no third-party push provider):
   *  - iOS: Apple Push Notification service with your developer account's .p8 key.
   *  - Android: Firebase Cloud Messaging (HTTP v1) with a Firebase service-account JSON.
   *  - Web: standard Web Push with VAPID keys (generated and stored automatically if you leave them blank).
   */
  /** Optional, free (developers.giphy.com): enables GIPHY sticker search for people who unlock it. */
  giphyApiKey: env.GIPHY_API_KEY ?? '',
  push: {
    apns: {
      teamId: env.APNS_TEAM_ID ?? '',
      keyId: env.APNS_KEY_ID ?? '',
      /** The .p8 key: its contents (newlines may be written as \n) or a path to the file. */
      key: env.APNS_KEY ?? '',
      bundleId: env.APNS_BUNDLE_ID ?? 'app.chatlol',
      /** 'production' for App Store / TestFlight builds, 'sandbox' for development builds. */
      env: env.APNS_ENV ?? (isProd ? 'production' : 'sandbox'),
      host: env.APNS_HOST ?? '',
    },
    fcm: {
      /** The Firebase service-account JSON (Project settings → Service accounts → Generate new private key): contents or a path. */
      serviceAccount: env.FIREBASE_SERVICE_ACCOUNT ?? '',
      baseUrl: env.FCM_BASE_URL ?? 'https://fcm.googleapis.com',
      tokenUrl: env.FCM_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
    },
    web: {
      publicKey: env.VAPID_PUBLIC_KEY ?? '',
      privateKey: env.VAPID_PRIVATE_KEY ?? '',
      /** Contact for push services: mailto: or https: URL. */
      subject: env.VAPID_SUBJECT ?? 'mailto:support@chatlol.app',
    },
  },
  /** Object storage for uploads (S3, Cloudflare R2, MinIO…). Empty bucket = local disk. */
  s3: {
    bucket: env.S3_BUCKET ?? '',
    region: env.S3_REGION ?? 'auto',
    endpoint: env.S3_ENDPOINT ?? '', // e.g. https://<account>.r2.cloudflarestorage.com
    publicUrl: (env.S3_PUBLIC_URL ?? '').replace(/\/$/, ''), // CDN / public bucket base URL
    // Bucket API keys (R2: an API token with Object Read & Write). Empty = the AWS SDK's usual lookup
    // (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or an instance role on AWS).
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  },
  /** WebRTC: your own TURN server (coturn). TURN_SECRET = coturn static-auth-secret (REST API credentials). */
  rtc: {
    stunUrls: (env.STUN_URLS ?? 'stun:stun.l.google.com:19302')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // TURN_URL (singular) is accepted too, as people often write it that way.
    turnUrls: (env.TURN_URLS ?? env.TURN_URL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    turnSecret: env.TURN_SECRET ?? '',
    turnUsername: env.TURN_USERNAME ?? '',
    turnCredential: env.TURN_CREDENTIAL ?? '',
    ttlSec: Number(env.TURN_TTL ?? 6 * 3600),
    /** Mesh: the host uploads one stream per viewer, so cap it to what a home uplink can carry. */
    maxViewers: Number(env.LIVE_MAX_VIEWERS ?? 12),
    /** Force media through TURN (hides IPs between peers). Needs TURN_URLS. */
    relayOnly: env.RTC_RELAY_ONLY === '1',
  },
  payments: {
    stripeSecretKey: env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    revenueCatWebhookAuth: env.REVENUECAT_WEBHOOK_AUTH ?? '',
  },
  /** Comma-separated emails that get the admin role (admin panel at /admin). */
  adminEmails: (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Optional: Spotify app credentials (developer.spotify.com) for in-app song search. Pasting links works without them. */
  spotify: { clientId: env.SPOTIFY_CLIENT_ID ?? '', clientSecret: env.SPOTIFY_CLIENT_SECRET ?? '' },
  /**
   * Optional: a YouTube Data API key (console.cloud.google.com → YouTube Data API v3). With it, Spotify / Apple profile
   * songs are matched to a full-length YouTube upload so visitors hear the whole song, not a 30-second preview.
   * Members can always paste a YouTube link themselves without it.
   */
  youtube: { apiKey: env.YOUTUBE_API_KEY ?? '' },
  /** Public web app origin used in email links (verification, password reset). */
  appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  mail: {
    /** Your SMTP server. SMTP_SECURE=true for implicit TLS (port 465); false uses STARTTLS when the server offers it (587/25). */
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' || env.SMTP_SECURE === '1' : Number(env.SMTP_PORT ?? 587) === 465,
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    /** Accept a self-signed certificate on your own mail server (SMTP_ALLOW_SELF_SIGNED=1). */
    allowSelfSigned: env.SMTP_ALLOW_SELF_SIGNED === '1',
    /** Alternative to the fields above: one smtp(s):// connection string. */
    url: env.SMTP_URL ?? '',
    from: env.MAIL_FROM ?? 'ChatLOL <hello@chatlol.app>',
  },
};
// Uploads to a bucket need a public address for the files, or every photo link would be broken.
if (config.s3.bucket && !/^https?:\/\//.test(config.s3.publicUrl))
  throw new Error('S3_BUCKET is set, so S3_PUBLIC_URL must be the public address of the bucket (e.g. https://media.chatlol.net)');

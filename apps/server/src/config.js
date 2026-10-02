import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Settings from apps/server/.env, if there is one. Variables that are already set (systemd's EnvironmentFile,
// the shell) win. Loaded here rather than with node --env-file, which crashes `node --watch` when the file is missing.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

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
    apiKey: env.NVIDIA_API_KEY ?? '',
    baseUrl: env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    models: (
      env.NIM_MODELS ?? 'meta/llama-3.1-8b-instruct,meta/llama-3.3-70b-instruct,mistralai/mistral-7b-instruct-v0.3,google/gemma-2-9b-it'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Bigger model for one-to-one DMs and replies to people, where quality matters most. */
    chatModel: env.NIM_CHAT_MODEL ?? 'meta/llama-3.3-70b-instruct',
    safetyModel: env.NIM_SAFETY_MODEL ?? '',
    rpm: Number(env.NIM_RPM ?? 30),
    imageUrl: env.NIM_IMAGE_URL ?? 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
    visionModel: env.NIM_VISION_MODEL ?? 'meta/llama-3.2-11b-vision-instruct',
  },
  ai: {
    enabled: (env.AI_PERSONAS_ENABLED ?? '1') !== '0',
    activity: Number(env.AI_ACTIVITY ?? 1),
    /** Multiplies persona reply delays (read, typing). 1 = human-like; tests use a tiny value. */
    replyPace: Number(env.AI_REPLY_PACE ?? 1),
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


import { randomBytes } from 'node:crypto';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

export const config = {
  port: Number(env.PORT ?? 4000),
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
  redisUrl: env.REDIS_URL ?? '',
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
  expoAccessToken: env.EXPO_ACCESS_TOKEN ?? '',
  /** Object storage for uploads (S3, Cloudflare R2, MinIO…). Empty bucket = local disk. */
  s3: {
    bucket: env.S3_BUCKET ?? '',
    region: env.S3_REGION ?? 'auto',
    endpoint: env.S3_ENDPOINT ?? '', // e.g. https://<account>.r2.cloudflarestorage.com
    publicUrl: (env.S3_PUBLIC_URL ?? '').replace(/\/$/, ''), // CDN / public bucket base URL
  },
  /** WebRTC: your own TURN server (coturn). TURN_SECRET = coturn static-auth-secret (REST API credentials). */
  rtc: {
    stunUrls: (env.STUN_URLS ?? 'stun:stun.l.google.com:19302')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    turnUrls: (env.TURN_URLS ?? '')
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
    smtpUrl: env.SMTP_URL ?? '', // smtps://user:pass@smtp.example.com:465
    from: env.MAIL_FROM ?? 'ChatLOL <hello@chatlol.app>',
  },
};

import { randomBytes } from 'node:crypto';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

export const config = {
  port: Number(env.PORT ?? 4000),
  isProd,
  corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:8081,app://chatlol').split(',').map((s) => s.trim()),
  jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  dbPath: env.DATABASE_PATH ?? './data/chatlol.db',
  publicUrl: env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 4000}`,
  uploadDir: env.UPLOAD_DIR ?? './data/uploads',
  nim: {
    apiKey: env.NVIDIA_API_KEY ?? '',
    baseUrl: env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    models: (env.NIM_MODELS ?? 'meta/llama-3.1-8b-instruct,meta/llama-3.3-70b-instruct,mistralai/mistral-7b-instruct-v0.3,google/gemma-2-9b-it')
      .split(',').map((s) => s.trim()).filter(Boolean),
    safetyModel: env.NIM_SAFETY_MODEL ?? '',
    rpm: Number(env.NIM_RPM ?? 30),
    imageUrl: env.NIM_IMAGE_URL ?? 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
    visionModel: env.NIM_VISION_MODEL ?? 'meta/llama-3.2-11b-vision-instruct',
  },
  ai: {
    enabled: (env.AI_PERSONAS_ENABLED ?? '1') !== '0',
    activity: Number(env.AI_ACTIVITY ?? 1),
  },
  expoAccessToken: env.EXPO_ACCESS_TOKEN ?? '',
};

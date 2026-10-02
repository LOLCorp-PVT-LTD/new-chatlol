import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config } from '../config.js';
import { newId } from '../db.js';
import { HttpError } from './http.js';

/** Sniffs the real file type from magic bytes — never trust the client's Content-Type. */
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP')
    return { ext: 'webp', mime: 'image/webp' };
  if (buf.subarray(0, 6).toString('latin1').startsWith('GIF8')) return { ext: 'gif', mime: 'image/gif' };
  const brand = buf.subarray(4, 12).toString('latin1');
  if (brand.startsWith('ftyp') && /heic|heix|hevc|mif1|msf1|avif/.test(buf.subarray(8, 12).toString('latin1'))) {
    return buf.subarray(8, 12).toString('latin1') === 'avif' ? { ext: 'avif', mime: 'image/avif' } : { ext: 'heic', mime: 'image/heic' };
  }
  return null;
}

let s3 = null;
async function s3Client() {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { region, endpoint, accessKeyId, secretAccessKey } = config.s3;
    s3 = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }
  return s3;
}

const localUrl = (key) => `${config.publicUrl}/uploads/${key}`;

/** Stores an image and returns its public URL. Uses S3/R2 when S3_BUCKET is set, else local disk. */
export async function putImage(buf, prefix = 'u') {
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'Only real images (jpg, png, webp, gif, heic) can be uploaded');
  const key = `${prefix}_${newId()}.${type.ext}`;
  if (config.s3.bucket) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (
      await s3Client()
    ).send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: `uploads/${key}`,
        Body: buf,
        ContentType: type.mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${config.s3.publicUrl}/uploads/${key}`;
  }
  await mkdir(config.uploadDir, { recursive: true });
  await writeFile(join(config.uploadDir, key), buf);
  return localUrl(key);
}

/** Reads back an uploaded image (used to show photos to the vision model). Caps size to avoid abuse. */
export async function readImage(url, maxBytes = 4_000_000) {
  try {
    if (url.startsWith(`${config.publicUrl}/uploads/`)) return await readFile(join(config.uploadDir, basename(url)));
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok || Number(res.headers.get('content-length') ?? 0) > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  } catch {
    return null;
  }
}

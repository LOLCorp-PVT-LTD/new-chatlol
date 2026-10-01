import { config } from '../config';
import { db } from '../db';

/**
 * Sends a push through the Expo push service (delivers to APNs + FCM for the native apps).
 * Desktop receives notifications over the socket and shows them with the OS notification centre.
 */
export async function sendPush(userId: string, title: string, body: string, data: Record<string, unknown> = {}) {
  const tokens = (await db.all<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = ?', userId)).map((r) => r.token);
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'default' }));
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(config.expoAccessToken ? { Authorization: `Bearer ${config.expoAccessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    const out = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    for (const [i, t] of (out?.data ?? []).entries()) {
      if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') await db.run('DELETE FROM push_tokens WHERE token = ?', tokens[i]);
    }
  } catch (e) {
    console.warn('[push] failed', (e as Error).message);
  }
}

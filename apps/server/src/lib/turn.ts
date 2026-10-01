import { createHmac } from 'node:crypto';
import type { IceConfig } from '@chatlol/shared';
import { config } from '../config';

/**
 * ICE servers for WebRTC. With TURN_SECRET set we mint short-lived coturn "REST API" credentials
 * (coturn: use-auth-secret + static-auth-secret=<TURN_SECRET>), so the long-term secret never reaches clients.
 */
export function iceConfig(userId: string): IceConfig {
  const { stunUrls, turnUrls, turnSecret, turnUsername, turnCredential, ttlSec, maxViewers, relayOnly } = config.rtc;
  const iceServers: IceConfig['iceServers'] = [];
  if (stunUrls.length) iceServers.push({ urls: stunUrls });
  if (turnUrls.length) {
    if (turnSecret) {
      const username = `${Math.floor(Date.now() / 1000) + ttlSec}:${userId}`;
      const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    } else if (turnUsername) {
      iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
    }
  }
  const hasTurn = iceServers.some((s) => s.username);
  return { iceServers, iceTransportPolicy: relayOnly && hasTurn ? 'relay' : 'all', ttl: ttlSec, maxViewers };
}

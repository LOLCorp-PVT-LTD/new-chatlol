import { EventEmitter } from 'node:events';
import { redisClient, duplicateRedis } from './shared';

/** Domain events. The AI persona engine listens here to react to humans. */
export interface DomainEvents {
  'post:created': { postId: string; authorId: string };
  'comment:created': { postId: string; commentId: string; authorId: string };
  'dm:sent': { conversationId: string; messageId: string; authorId: string };
  'lounge:sent': { loungeId: string; messageId: string; authorId: string };
  'thread:created': { threadId: string; authorId: string };
  'thread:replied': { threadId: string; replyId: string; authorId: string };
  'stream:started': { streamId: string; hostId: string };
  'stream:chat': { streamId: string; messageId: string; authorId: string };
}

const CHANNEL = 'chatlol:events';

/**
 * In-process emitter; with Redis it becomes cluster-wide (pub/sub), so the single worker instance
 * that runs the personas hears events from every API instance.
 */
class Bus extends EventEmitter {
  private subscribed = false;
  emitEvent<K extends keyof DomainEvents>(k: K, p: DomainEvents[K]) {
    const r = redisClient();
    if (r) void r.publish(CHANNEL, JSON.stringify({ k, p })).catch(() => this.emit(k, p));
    else this.emit(k, p);
  }
  onEvent<K extends keyof DomainEvents>(k: K, fn: (p: DomainEvents[K]) => void) { this.on(k, fn); }
  async listenCluster() {
    const r = redisClient();
    if (!r || this.subscribed) return;
    this.subscribed = true;
    const sub = duplicateRedis();
    await sub.subscribe(CHANNEL);
    sub.on('message', (_c: string, msg: string) => {
      try { const { k, p } = JSON.parse(msg); this.emit(k, p); } catch { /* ignore */ }
    });
  }
}
export const bus = new Bus();
bus.setMaxListeners(50);

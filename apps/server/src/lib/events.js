import { EventEmitter } from 'node:events';
import { redisClient, duplicateRedis } from './shared.js';

/**
 * Domain events (the AI persona engine listens here to react to humans):
 *  post:created {postId, authorId} · comment:created {postId, commentId, authorId}
 *  dm:sent {conversationId, messageId, authorId} · lounge:sent {loungeId, messageId, authorId}
 *  thread:created {threadId, authorId} · thread:replied {threadId, replyId, authorId}
 *  stream:started {streamId, hostId} · stream:chat {streamId, messageId, authorId}
 */
const CHANNEL = 'chatlol:events';

/**
 * In-process emitter; with Redis it becomes cluster-wide (pub/sub), so the single worker instance
 * that runs the personas hears events from every API instance.
 */
class Bus extends EventEmitter {
  subscribed = false;
  emitEvent(k, p) {
    const r = redisClient();
    if (r) void r.publish(CHANNEL, JSON.stringify({ k, p })).catch(() => this.emit(k, p));
    else this.emit(k, p);
  }
  onEvent(k, fn) {
    this.on(k, fn);
  }
  async listenCluster() {
    const r = redisClient();
    if (!r || this.subscribed) return;
    this.subscribed = true;
    const sub = duplicateRedis();
    await sub.subscribe(CHANNEL);
    sub.on('message', (_c, msg) => {
      try {
        const { k, p } = JSON.parse(msg);
        this.emit(k, p);
      } catch {
        /* ignore */
      }
    });
  }
}
export const bus = new Bus();
bus.setMaxListeners(50);

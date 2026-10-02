import { EventEmitter } from 'node:events';
import { redisClient, duplicateRedis, sharedBackend } from './shared.js';
import { db } from '../db.js';

/**
 * Domain events (the AI persona engine listens here to react to humans):
 *  post:created {postId, authorId} · comment:created {postId, commentId, authorId}
 *  dm:sent {conversationId, messageId, authorId} · lounge:sent {loungeId, messageId, authorId}
 *  thread:created {threadId, authorId} · thread:replied {threadId, replyId, authorId}
 *  stream:started {streamId, hostId} · stream:chat {streamId, messageId, authorId}
 */
const CHANNEL = 'chatlol:events';

/**
 * In-process emitter that becomes cluster-wide, so the single worker instance that runs the personas
 * hears events from every API instance:
 *  - MongoDB: events are written to `busEvents` and picked up with a change stream (needs a replica set —
 *    MongoDB Atlas always is; a standalone server falls back to in-process only).
 *  - Redis: pub/sub, when REDIS_URL is set.
 */
const mongoBus = () => sharedBackend() === 'mongodb' && db.transactions;

class Bus extends EventEmitter {
  subscribed = false;
  emitEvent(k, p) {
    const r = redisClient();
    if (r) void r.publish(CHANNEL, JSON.stringify({ k, p })).catch(() => this.emit(k, p));
    else if (mongoBus()) void db.busEvents.raw.insertOne({ k, p, at: new Date() }).catch(() => this.emit(k, p));
    else this.emit(k, p);
  }
  onEvent(k, fn) {
    this.on(k, fn);
  }
  async listenCluster() {
    if (this.subscribed) return;
    if (mongoBus()) return this.listenMongo();
    const r = redisClient();
    if (!r) return;
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

  listenMongo() {
    this.subscribed = true;
    const watch = () => {
      const stream = db.busEvents.raw.watch([{ $match: { operationType: 'insert' } }]);
      stream.on('change', (c) => this.emit(c.fullDocument.k, c.fullDocument.p));
      // A dropped stream (failover, network blip) reconnects after a pause.
      stream.on('error', (e) => {
        console.warn('[events] change stream', e.message);
        void stream.close().catch(() => {});
        setTimeout(watch, 2_000).unref();
      });
      this.stream = stream;
    };
    watch();
  }
  async close() {
    await this.stream?.close().catch(() => {});
  }
}
export const bus = new Bus();
bus.setMaxListeners(50);

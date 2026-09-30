import { EventEmitter } from 'node:events';

/** In-process domain events. The AI persona engine listens here to react to humans. */
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

class Bus extends EventEmitter {
  emitEvent<K extends keyof DomainEvents>(k: K, p: DomainEvents[K]) { this.emit(k, p); }
  onEvent<K extends keyof DomainEvents>(k: K, fn: (p: DomainEvents[K]) => void) { this.on(k, fn); }
}
export const bus = new Bus();
bus.setMaxListeners(50);

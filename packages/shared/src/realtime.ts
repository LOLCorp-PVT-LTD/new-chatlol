import type { ChatMessage, NotificationItem, RewardEvent, UserPublic, Post, ID } from './types';

/** Server → client events */
export interface ServerEvents {
  'lounge:message': (m: ChatMessage) => void;
  'lounge:presence': (p: { loungeId: ID; onlineCount: number; joined?: UserPublic; left?: ID }) => void;
  'dm:message': (m: ChatMessage) => void;
  'dm:typing': (p: { conversationId: ID; userId: ID; typing: boolean }) => void;
  'dm:read': (p: { conversationId: ID; userId: ID; at: string }) => void;
  'notification': (n: NotificationItem) => void;
  'reward': (r: RewardEvent) => void;
  'wallet': (w: { sparks: number; xp: number; level: number }) => void;
  'feed:new': (p: Post) => void;
  'ticker': (t: { id: ID; text: string; actor: UserPublic | null; at: string }) => void;
  'stream:chat': (m: ChatMessage) => void;
  'stream:gift': (g: { streamId: ID; from: UserPublic; giftId: string; emoji: string; amount: number }) => void;
  'stream:viewers': (v: { streamId: ID; viewers: number }) => void;
  'presence': (p: { userId: ID; online: boolean }) => void;
}

/** Client → server events */
export interface ClientEvents {
  'lounge:join': (loungeId: ID, ack?: (history: ChatMessage[]) => void) => void;
  'lounge:leave': (loungeId: ID) => void;
  'lounge:send': (p: { loungeId: ID; body: string; replyToId?: ID | null }) => void;
  'dm:typing': (p: { conversationId: ID; typing: boolean }) => void;
  'dm:read': (p: { conversationId: ID }) => void;
  'stream:join': (streamId: ID) => void;
  'stream:leave': (streamId: ID) => void;
  'stream:chat': (p: { streamId: ID; body: string }) => void;
}

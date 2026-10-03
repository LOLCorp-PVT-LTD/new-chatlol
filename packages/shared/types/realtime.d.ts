import type { ChatMessage, NotificationItem, RewardEvent, UserPublic, Post, ID, RtcSignal } from './types';
/** Server → client events */
export interface ServerEvents {
    'lounge:message': (m: ChatMessage) => void;
    'lounge:presence': (p: {
        loungeId: ID;
        onlineCount: number;
        joined?: UserPublic;
        left?: UserPublic;
    }) => void;
    /** A radio station changed (new song, queue, votes). */
    'radio:state': (s: import('./types').RadioState) => void;
    /** The lounge was deleted by its owner or staff. */
    'lounge:deleted': (p: { loungeId: ID }) => void;
    /** The lounge's name, topic, cover etc. changed. */
    'lounge:updated': (l: import('./types').Lounge) => void;
    /** Sent to a member as they enter: who's in the room now. */
    'lounge:members': (p: {
        loungeId: ID;
        members: UserPublic[];
    }) => void;
    'dm:message': (m: ChatMessage) => void;
    'dm:typing': (p: {
        conversationId: ID;
        userId: ID;
        typing: boolean;
    }) => void;
    'dm:read': (p: {
        conversationId: ID;
        userId: ID;
        at: string;
    }) => void;
    'notification': (n: NotificationItem) => void;
    'reward': (r: RewardEvent) => void;
    'wallet': (w: {
        sparks: number;
        gems: number;
        gold: number;
        xp: number;
        level: number;
    }) => void;
    'feed:new': (p: Post) => void;
    'arena:update': (p: { id: ID; version: number; status: string }) => void;
    /** A player's live activity in a game (e.g. pool aim and power), relayed to everyone else. */
    'arena:live': (p: { id: ID; userId: ID; data: Record<string, unknown> }) => void;
    'message:reactions': (p: { id: ID; roomId: ID; reactions: Partial<Record<import('./types').ReactionKind, number>> }) => void;
    /** A Kick Ticket removed you from a lounge. */
    'lounge:kicked': (p: { loungeId: ID; by: string; minutes: number }) => void;
    'shout:new': (s: import('./types').Shout) => void;
    'shout:reactions': (p: { id: ID; reactions: Record<import('./types').ReactionKind, number> }) => void;
    'content:removed': (p: { type: string; id: ID; reason?: string }) => void;
    moderation: (p: { action: string; until: string | null; reason: string | null }) => void;
    /** A message for the sender only (e.g. a locked sticker). */
    toast: (t: { kind: 'error' | 'info'; title: string }) => void;
    'ticker': (t: {
        id: ID;
        text: string;
        actor: UserPublic | null;
        at: string;
    }) => void;
    'stream:chat': (m: ChatMessage) => void;
    'stream:gift': (g: {
        streamId: ID;
        from: UserPublic;
        giftId: string;
        emoji: string;
        amount: number;
    }) => void;
    'stream:viewers': (v: {
        streamId: ID;
        viewers: number;
    }) => void;
    'presence': (p: {
        userId: ID;
        online: boolean;
    }) => void;
    'stream:ended': (p: {
        streamId: ID;
    }) => void;
    /** Host: a viewer wants video — create a peer connection and send them an offer. */
    'rtc:viewer-joined': (p: {
        streamId: ID;
        peer: string;
    }) => void;
    /** Host: a viewer left — close their peer connection. Viewer: the host left/stopped video. */
    'rtc:peer-left': (p: {
        streamId: ID;
        peer: string;
    }) => void;
    /** Viewer: the host (re)started broadcasting — ask for video again. */
    'rtc:host-ready': (p: {
        streamId: ID;
    }) => void;
    'rtc:signal': (s: RtcSignal) => void;
}
/** Client → server events */
export interface ClientEvents {
    /** Acks with the recent history, or `{ kicked: true }` while a Kick Ticket keeps you out. */
    'lounge:join': (loungeId: ID, ack?: (history: ChatMessage[] | { kicked: true }) => void) => void;
    'lounge:leave': (loungeId: ID) => void;
    'lounge:send': (p: {
        loungeId: ID;
        body: string;
        replyToId?: ID | null;
        sticker?: import('./stickers').StickerInput | null;
    }) => void;
    'dm:typing': (p: {
        conversationId: ID;
        typing: boolean;
    }) => void;
    'dm:read': (p: {
        conversationId: ID;
    }) => void;
    'stream:join': (streamId: ID) => void;
    'arena:watch': (arenaId: ID) => void;
    'arena:unwatch': (arenaId: ID) => void;
    'arena:live': (arenaId: ID, data: Record<string, unknown>) => void;
    /** Listen to a radio station ('shouts' or 'lounge:<id>'). */
    'radio:watch': (station: string) => void;
    'radio:unwatch': (station: string) => void;
    'stream:leave': (streamId: ID) => void;
    'stream:chat': (p: {
        streamId: ID;
        body: string;
        sticker?: import('./stickers').StickerInput | null;
    }) => void;
    /** Host announces it is broadcasting from this socket. */
    'rtc:host': (streamId: ID, ack?: (r: {
        ok: boolean;
        error?: string;
    }) => void) => void;
    /** Viewer asks the host for a video connection (subject to the mesh viewer cap). */
    'rtc:watch': (streamId: ID, ack?: (r: {
        ok: boolean;
        reason?: 'full' | 'offline' | 'no-video';
    }) => void) => void;
    'rtc:unwatch': (streamId: ID) => void;
    'rtc:signal': (s: RtcSignal) => void;
}

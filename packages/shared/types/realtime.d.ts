import type { ChatMessage, NotificationItem, RewardEvent, UserPublic, Post, ID, RtcSignal } from './types';
/** Server → client events */
export interface ServerEvents {
    'lounge:message': (m: ChatMessage) => void;
    'lounge:presence': (p: {
        loungeId: ID;
        onlineCount: number;
        joined?: UserPublic;
        left?: ID;
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
        xp: number;
        level: number;
    }) => void;
    'feed:new': (p: Post) => void;
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
    'lounge:join': (loungeId: ID, ack?: (history: ChatMessage[]) => void) => void;
    'lounge:leave': (loungeId: ID) => void;
    'lounge:send': (p: {
        loungeId: ID;
        body: string;
        replyToId?: ID | null;
    }) => void;
    'dm:typing': (p: {
        conversationId: ID;
        typing: boolean;
    }) => void;
    'dm:read': (p: {
        conversationId: ID;
    }) => void;
    'stream:join': (streamId: ID) => void;
    'stream:leave': (streamId: ID) => void;
    'stream:chat': (p: {
        streamId: ID;
        body: string;
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

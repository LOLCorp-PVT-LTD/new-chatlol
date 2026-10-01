import type { IceConfig, RtcSignal } from './types';
/**
 * WebRTC mesh for live streams, shared by web (browser WebRTC) and React Native (react-native-webrtc).
 * The host keeps one RTCPeerConnection per viewer and sends its camera/mic to each; media is relayed by
 * your TURN server only when a direct path isn't possible. The server just relays SDP/ICE (see realtime.ts).
 *
 * Platform objects are injected so this file has no DOM / RN imports.
 */
/** Minimal surface of RTCPeerConnection used here (satisfied by the browser and react-native-webrtc). */
export interface PeerLike {
    addTrack(track: unknown, stream: unknown): unknown;
    createOffer(opts?: object): Promise<{
        type: string;
        sdp?: string;
    }>;
    createAnswer(): Promise<{
        type: string;
        sdp?: string;
    }>;
    setLocalDescription(d: {
        type: string;
        sdp?: string;
    }): Promise<void>;
    setRemoteDescription(d: {
        type: string;
        sdp?: string;
    }): Promise<void>;
    addIceCandidate(c: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
    }): Promise<void>;
    addEventListener(type: string, fn: (e: any) => void): void;
    close(): void;
    connectionState?: string;
    addTransceiver?(kind: string, init: {
        direction: string;
    }): unknown;
}
export type PeerFactory = (cfg: {
    iceServers: IceConfig['iceServers'];
    iceTransportPolicy?: 'all' | 'relay';
}) => PeerLike;
export interface SignalSocket {
    emit(ev: 'rtc:signal', s: RtcSignal): void;
    emit(ev: 'rtc:host', streamId: string, ack: (r: {
        ok: boolean;
        error?: string;
    }) => void): void;
    emit(ev: 'rtc:watch', streamId: string, ack: (r: {
        ok: boolean;
        reason?: 'full' | 'offline' | 'no-video';
    }) => void): void;
    emit(ev: 'rtc:unwatch', streamId: string): void;
    on(ev: string, fn: (...a: any[]) => void): unknown;
    off(ev: string, fn: (...a: any[]) => void): unknown;
}
interface MediaStreamLike {
    getTracks(): unknown[];
}
export declare class MeshHost {
    private streamId;
    private socket;
    private ice;
    private makePeer;
    private media;
    private peers;
    private handlers;
    onViewersChange?: (n: number) => void;
    constructor(streamId: string, socket: SignalSocket, ice: IceConfig, makePeer: PeerFactory, media: MediaStreamLike);
    start(): Promise<void>;
    private announce;
    private connect;
    private onSignal;
    private drop;
    get viewerCount(): number;
    stop(): void;
}
export type ViewerState = 'connecting' | 'live' | 'full' | 'offline' | 'no-video' | 'failed';
export declare class MeshViewer {
    private streamId;
    private socket;
    private ice;
    private makePeer;
    private pc;
    private host;
    private handlers;
    private pending;
    onStream?: (stream: unknown) => void;
    onState?: (s: ViewerState) => void;
    constructor(streamId: string, socket: SignalSocket, ice: IceConfig, makePeer: PeerFactory);
    start(): void;
    private request;
    private reset;
    private onSignal;
    stop(): void;
}
export {};

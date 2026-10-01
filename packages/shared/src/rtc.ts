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
  createOffer(opts?: object): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(d: { type: string; sdp?: string }): Promise<void>;
  addIceCandidate(c: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }): Promise<void>;
  addEventListener(type: string, fn: (e: any) => void): void;
  close(): void;
  connectionState?: string;
  addTransceiver?(kind: string, init: { direction: string }): unknown;
}
export type PeerFactory = (cfg: { iceServers: IceConfig['iceServers']; iceTransportPolicy?: 'all' | 'relay' }) => PeerLike;

export interface SignalSocket {
  emit(ev: 'rtc:signal', s: RtcSignal): void;
  emit(ev: 'rtc:host', streamId: string, ack: (r: { ok: boolean; error?: string }) => void): void;
  emit(ev: 'rtc:watch', streamId: string, ack: (r: { ok: boolean; reason?: 'full' | 'offline' | 'no-video' }) => void): void;
  emit(ev: 'rtc:unwatch', streamId: string): void;
  on(ev: string, fn: (...a: any[]) => void): unknown;
  off(ev: string, fn: (...a: any[]) => void): unknown;
}

interface MediaStreamLike { getTracks(): unknown[] }

const candidateJson = (c: any) => (c ? { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } : null);

export class MeshHost {
  private peers = new Map<string, PeerLike>();
  private handlers: [string, (...a: any[]) => void][] = [];
  onViewersChange?: (n: number) => void;

  constructor(private streamId: string, private socket: SignalSocket, private ice: IceConfig, private makePeer: PeerFactory, private media: MediaStreamLike) {}

  start(): Promise<void> {
    const on = (ev: string, fn: (...a: any[]) => void) => { this.socket.on(ev, fn); this.handlers.push([ev, fn]); };
    on('rtc:viewer-joined', ({ streamId, peer }: { streamId: string; peer: string }) => { if (streamId === this.streamId) void this.connect(peer); });
    on('rtc:peer-left', ({ streamId, peer }: { streamId: string; peer: string }) => { if (streamId === this.streamId) this.drop(peer); });
    on('rtc:signal', (s: RtcSignal) => { if (s.streamId === this.streamId) void this.onSignal(s); });
    // Re-announce after a reconnect so viewers re-request video.
    on('connect', () => this.announce());
    return this.announce();
  }

  private announce() {
    return new Promise<void>((resolve, reject) => this.socket.emit('rtc:host', this.streamId, (r) => (r.ok ? resolve() : reject(new Error(r.error ?? 'Could not start broadcast')))));
  }

  private async connect(peer: string) {
    this.drop(peer);
    const pc = this.makePeer({ iceServers: this.ice.iceServers, iceTransportPolicy: this.ice.iceTransportPolicy });
    this.peers.set(peer, pc);
    this.onViewersChange?.(this.peers.size);
    for (const t of this.media.getTracks()) pc.addTrack(t, this.media);
    pc.addEventListener('icecandidate', (e) => { if (e.candidate) this.socket.emit('rtc:signal', { streamId: this.streamId, peer, candidate: candidateJson(e.candidate) }); });
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(peer); });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('rtc:signal', { streamId: this.streamId, peer, description: { type: 'offer', sdp: offer.sdp ?? '' } });
  }

  private async onSignal(s: RtcSignal) {
    const pc = this.peers.get(s.peer);
    if (!pc) return;
    if (s.description?.type === 'answer') await pc.setRemoteDescription(s.description);
    else if (s.candidate) await pc.addIceCandidate(s.candidate).catch(() => {});
  }

  private drop(peer: string) {
    const pc = this.peers.get(peer);
    if (!pc) return;
    pc.close();
    this.peers.delete(peer);
    this.onViewersChange?.(this.peers.size);
  }

  get viewerCount() { return this.peers.size; }

  stop() {
    for (const [ev, fn] of this.handlers) this.socket.off(ev, fn);
    this.handlers = [];
    for (const p of [...this.peers.keys()]) this.drop(p);
  }
}

export type ViewerState = 'connecting' | 'live' | 'full' | 'offline' | 'no-video' | 'failed';

export class MeshViewer {
  private pc: PeerLike | null = null;
  private host: string | null = null;
  private handlers: [string, (...a: any[]) => void][] = [];
  private pending: RtcSignal['candidate'][] = [];
  onStream?: (stream: unknown) => void;
  onState?: (s: ViewerState) => void;

  constructor(private streamId: string, private socket: SignalSocket, private ice: IceConfig, private makePeer: PeerFactory) {}

  start() {
    const on = (ev: string, fn: (...a: any[]) => void) => { this.socket.on(ev, fn); this.handlers.push([ev, fn]); };
    on('rtc:signal', (s: RtcSignal) => { if (s.streamId === this.streamId) void this.onSignal(s); });
    on('rtc:host-ready', ({ streamId }: { streamId: string }) => { if (streamId === this.streamId) this.request(); });
    on('rtc:peer-left', ({ streamId, peer }: { streamId: string; peer: string }) => {
      if (streamId === this.streamId && peer === this.host) { this.reset(); this.onState?.('offline'); }
    });
    on('connect', () => this.request());
    this.request();
  }

  private request() {
    this.onState?.('connecting');
    this.socket.emit('rtc:watch', this.streamId, (r) => { if (!r.ok) this.onState?.(r.reason ?? 'offline'); });
  }

  private reset() {
    this.pc?.close();
    this.pc = null;
    this.host = null;
    this.pending = [];
  }

  private async onSignal(s: RtcSignal) {
    if (s.description?.type === 'offer') {
      this.reset();
      this.host = s.peer;
      const pc = this.makePeer({ iceServers: this.ice.iceServers, iceTransportPolicy: this.ice.iceTransportPolicy });
      this.pc = pc;
      pc.addEventListener('track', (e) => { if (e.streams?.[0]) { this.onStream?.(e.streams[0]); this.onState?.('live'); } });
      pc.addEventListener('icecandidate', (e) => { if (e.candidate && this.host) this.socket.emit('rtc:signal', { streamId: this.streamId, peer: this.host, candidate: candidateJson(e.candidate) }); });
      pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed') this.onState?.('failed'); });
      await pc.setRemoteDescription(s.description);
      for (const c of this.pending.splice(0)) if (c) await pc.addIceCandidate(c).catch(() => {});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('rtc:signal', { streamId: this.streamId, peer: s.peer, description: { type: 'answer', sdp: answer.sdp ?? '' } });
    } else if (s.candidate) {
      if (this.pc) await this.pc.addIceCandidate(s.candidate).catch(() => {});
      else this.pending.push(s.candidate);
    }
  }

  stop() {
    this.socket.emit('rtc:unwatch', this.streamId);
    for (const [ev, fn] of this.handlers) this.socket.off(ev, fn);
    this.handlers = [];
    this.reset();
  }
}

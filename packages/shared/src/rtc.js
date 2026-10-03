/**
 * WebRTC mesh for live streams, shared by web (browser WebRTC) and React Native (react-native-webrtc).
 * The host keeps one RTCPeerConnection per viewer and sends its camera/mic to each; media is relayed by
 * your TURN server only when a direct path isn't possible. The server just relays SDP/ICE (see apps/server/src/realtime.js).
 *
 * Platform objects are injected so this file has no DOM / RN imports.
 */

/**
 * `makePeer(cfg)` must return an RTCPeerConnection-like object (the browser's or react-native-webrtc's);
 * `socket` is a Socket.IO client connected to the ChatLOL API.
 */
const candidateJson = (c) => (c ? { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } : null);

export class MeshHost {
  peers = new Map();
  /** Viewer ICE candidates that arrived before that viewer's answer was applied. */
  early = new Map();
  handlers = [];
  onViewersChange;

  constructor(streamId, socket, ice, makePeer, media) {
    this.streamId = streamId;
    this.socket = socket;
    this.ice = ice;
    this.makePeer = makePeer;
    this.media = media;
  }

  start() {
    const on = (ev, fn) => {
      this.socket.on(ev, fn);
      this.handlers.push([ev, fn]);
    };
    on('rtc:viewer-joined', ({ streamId, peer }) => {
      if (streamId === this.streamId) void this.connect(peer);
    });
    on('rtc:peer-left', ({ streamId, peer }) => {
      if (streamId === this.streamId) this.drop(peer);
    });
    on('rtc:signal', (s) => {
      if (s.streamId === this.streamId) void this.onSignal(s);
    });
    // Re-announce after a reconnect so viewers re-request video.
    on('connect', () => this.announce());
    return this.announce();
  }

  announce() {
    return new Promise((resolve, reject) =>
      this.socket.emit('rtc:host', this.streamId, (r) => (r.ok ? resolve() : reject(new Error(r.error ?? 'Could not start broadcast')))),
    );
  }

  async connect(peer) {
    this.drop(peer);
    const pc = this.makePeer({ iceServers: this.ice.iceServers, iceTransportPolicy: this.ice.iceTransportPolicy });
    this.peers.set(peer, pc);
    this.onViewersChange?.(this.peers.size);
    for (const t of this.media.getTracks()) pc.addTrack(t, this.media);
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) this.socket.emit('rtc:signal', { streamId: this.streamId, peer, candidate: candidateJson(e.candidate) });
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(peer);
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('rtc:signal', { streamId: this.streamId, peer, description: { type: 'offer', sdp: offer.sdp ?? '' } });
  }

  async onSignal(s) {
    const pc = this.peers.get(s.peer);
    if (!pc) return;
    if (s.description?.type === 'answer') {
      await pc.setRemoteDescription(s.description);
      for (const c of this.early.get(s.peer)?.splice(0) ?? []) await pc.addIceCandidate(c).catch(() => {});
    } else if (s.candidate) {
      // Signals can overtake each other on the server, so a candidate may arrive before the answer.
      if (pc.remoteDescription) await pc.addIceCandidate(s.candidate).catch(() => {});
      else this.early.set(s.peer, [...(this.early.get(s.peer) ?? []), s.candidate]);
    }
  }

  drop(peer) {
    const pc = this.peers.get(peer);
    if (!pc) return;
    pc.close();
    this.peers.delete(peer);
    this.early.delete(peer);
    this.onViewersChange?.(this.peers.size);
  }

  get viewerCount() {
    return this.peers.size;
  }

  stop() {
    for (const [ev, fn] of this.handlers) this.socket.off(ev, fn);
    this.handlers = [];
    for (const p of [...this.peers.keys()]) this.drop(p);
  }
}

export class MeshViewer {
  pc = null;
  host = null;
  handlers = [];
  pending = [];
  onStream;
  onState;

  constructor(streamId, socket, ice, makePeer) {
    this.streamId = streamId;
    this.socket = socket;
    this.ice = ice;
    this.makePeer = makePeer;
  }

  start() {
    const on = (ev, fn) => {
      this.socket.on(ev, fn);
      this.handlers.push([ev, fn]);
    };
    on('rtc:signal', (s) => {
      if (s.streamId === this.streamId) void this.onSignal(s);
    });
    on('rtc:host-ready', ({ streamId }) => {
      if (streamId === this.streamId) this.request();
    });
    on('rtc:peer-left', ({ streamId, peer }) => {
      if (streamId === this.streamId && peer === this.host) {
        this.reset();
        this.onState?.('offline');
      }
    });
    on('connect', () => this.request());
    this.request();
  }

  request() {
    this.onState?.('connecting');
    this.socket.emit('rtc:watch', this.streamId, (r) => {
      if (!r.ok) this.onState?.(r.reason ?? 'offline');
    });
  }

  reset() {
    this.pc?.close();
    this.pc = null;
    this.host = null;
    this.pending = [];
  }

  async onSignal(s) {
    if (s.description?.type === 'offer') {
      this.reset();
      this.host = s.peer;
      const pc = this.makePeer({ iceServers: this.ice.iceServers, iceTransportPolicy: this.ice.iceTransportPolicy });
      this.pc = pc;
      pc.addEventListener('track', (e) => {
        if (e.streams?.[0]) {
          this.onStream?.(e.streams[0]);
          this.onState?.('live');
        }
      });
      pc.addEventListener('icecandidate', (e) => {
        if (e.candidate && this.host)
          this.socket.emit('rtc:signal', { streamId: this.streamId, peer: this.host, candidate: candidateJson(e.candidate) });
      });
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') this.onState?.('failed');
      });
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

import React, { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PeerFactory } from '@chatlol/shared';

/** Browser / Electron WebRTC (react-native-web build). */
export const makePeer: PeerFactory = (cfg) => new RTCPeerConnection(cfg as RTCConfiguration) as never;

export type LocalStream = MediaStream;

export function getLocalStream(front = true): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: { facingMode: front ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
}

export function switchCamera(_stream: MediaStream) { /* desktop: single camera */ }

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function VideoView({ stream, mirror, style }: { stream: unknown; mirror?: boolean; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream as MediaStream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  if (!stream) return null;
  const flat = (Array.isArray(style) ? Object.assign({}, ...style) : style) as React.CSSProperties | undefined;
  return React.createElement('video', {
    ref, playsInline: true, autoPlay: true, muted: !!mirror,
    style: { objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined, ...flat },
  });
}

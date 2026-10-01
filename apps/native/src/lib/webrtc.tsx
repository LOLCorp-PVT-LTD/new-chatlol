import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { RTCPeerConnection, RTCView, mediaDevices, type MediaStream } from 'react-native-webrtc';
import type { PeerFactory } from '@chatlol/shared';

/** iOS / Android WebRTC (react-native-webrtc). The web/desktop build uses webrtc.web.tsx instead. */
export const makePeer: PeerFactory = (cfg) => new RTCPeerConnection(cfg) as never;

export type LocalStream = MediaStream;

export async function getLocalStream(front = true): Promise<MediaStream> {
  return mediaDevices.getUserMedia({
    audio: true,
    video: { facingMode: front ? 'user' : 'environment', width: 1280, height: 720, frameRate: 30 },
  }) as Promise<MediaStream>;
}

/** Flips between front and back cameras without renegotiating (react-native-webrtc extension). */
export function switchCamera(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as unknown as { _switchCamera?: () => void };
  track?._switchCamera?.();
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function VideoView({ stream, mirror, style }: { stream: unknown; mirror?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!stream) return null;
  return <RTCView streamURL={(stream as MediaStream).toURL()} objectFit="cover" mirror={mirror} style={style} zOrder={0} />;
}

import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type { StickerInput } from '@chatlol/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { ChatMessage, LiveStream, ViewerState } from '@chatlol/shared';
import { GIFTS, compact, MeshHost, MeshViewer, type SignalSocket } from '@chatlol/shared';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { errorToast, toast } from '../../lib/actions';
import { haptic } from '../../lib/native';
import { session, useSession } from '../../lib/store';
import { useColors } from '../../lib/theme';
import { getLocalStream, makePeer, stopStream, switchCamera, VideoView, type LocalStream } from '../../lib/webrtc';
import { ScreenHeader } from '../../components/chrome';
import { Avatar } from '../../components/people';
import { ChatList, ChatScreen, Composer } from '../../components/Chat';
import { Button, IconButton, Row, Tap, Text } from '../../components/ui';

const STATE_TEXT: Partial<Record<ViewerState, string>> = {
  connecting: 'Connecting to the stream…',
  full: 'Video is full right now — chat & gifts still work 🎁',
  offline: 'Waiting for the host’s camera…',
  failed: 'Couldn’t connect video. Check your network.',
};

export default function LiveRoom() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.user?.id);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [videoViewers, setVideoViewers] = useState(0);
  const [burst, setBurst] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [local, setLocal] = useState<LocalStream | null>(null);
  const [remote, setRemote] = useState<unknown>(null);
  const [vstate, setVstate] = useState<ViewerState | 'idle'>('idle');
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [ended, setEnded] = useState(false);
  const mesh = useRef<{ stop(): void } | null>(null);
  const localRef = useRef<LocalStream | null>(null);
  const isHost = !!stream && stream.host.id === me;

  useEffect(() => {
    const s = getSocket();
    let cancelled = false;
    const rejoin = () => s.emit('stream:join', id);
    const onChat = (m: ChatMessage) => { if (m.roomId === id) setChat((x) => [...x.slice(-150), m]); };
    const onGift = (g: { streamId: string; emoji: string; amount: number }) => {
      if (g.streamId !== id) return;
      setBurst(g.emoji); haptic.light(); setTimeout(() => setBurst(null), 1200);
      setStream((st) => (st ? { ...st, giftsTotal: st.giftsTotal + g.amount } : st));
    };
    const onViewers = (v: { streamId: string; viewers: number }) => { if (v.streamId === id) setViewers(v.viewers); };
    const onEnded = (e: { streamId: string }) => { if (e.streamId === id) { setEnded(true); mesh.current?.stop(); } };
    s.on('connect', rejoin);
    s.on('stream:chat', onChat); s.on('stream:gift', onGift); s.on('stream:viewers', onViewers); s.on('stream:ended', onEnded);
    rejoin();

    void (async () => {
      const r = await api.stream(id);
      if (cancelled) return;
      setStream(r.stream); setChat(r.chat); setViewers(r.stream.viewers);
      if (!r.stream.video || !session.get().user) return;
      const ice = await api.iceServers();
      const sock = s as unknown as SignalSocket;
      if (r.stream.host.id === session.get().user?.id) {
        try {
          const media = await getLocalStream();
          if (cancelled) return stopStream(media);
          localRef.current = media;
          setLocal(media);
          const host = new MeshHost(id, sock, ice, makePeer, media as never);
          host.onViewersChange = setVideoViewers;
          mesh.current = host;
          await host.start();
          void activateKeepAwakeAsync('live');
        } catch (e) {
          toast({ kind: 'info', title: 'Camera unavailable — streaming chat-only', body: (e as Error).message });
        }
      } else {
        const viewer = new MeshViewer(id, sock, ice, makePeer);
        viewer.onState = setVstate;
        viewer.onStream = setRemote;
        mesh.current = viewer;
        viewer.start();
      }
    })().catch(errorToast);

    return () => {
      cancelled = true;
      mesh.current?.stop();
      stopStream(localRef.current);
      deactivateKeepAwake('live');
      s.emit('stream:leave', id);
      s.off('connect', rejoin);
      s.off('stream:chat', onChat); s.off('stream:gift', onGift); s.off('stream:viewers', onViewers); s.off('stream:ended', onEnded);
    };
  }, [id]);

  function toggle(kind: 'video' | 'audio') {
    localRef.current?.getTracks().filter((t) => t.kind === kind).forEach((t) => { t.enabled = !t.enabled; });
    haptic.tap();
    if (kind === 'video') setCam((v) => !v); else setMic((v) => !v);
  }
  async function gift(giftId: string) {
    try { const r = await api.sendGift(id, giftId); session.patchUser({ sparks: r.sparks }); haptic.success(); } catch (e) { errorToast(e); }
  }
  const send = (sticker: StickerInput | null = null) => {
    if (!draft.trim() && !sticker) return;
    getSocket().emit('stream:chat', { streamId: id, body: sticker ? '' : draft.trim(), sticker });
    if (!sticker) setDraft('');
  };
  const showVideo = isHost ? !!local : vstate === 'live' && !!remote;

  return (
    <ChatScreen>
      <ScreenHeader title={stream?.title ?? 'Live'} right={isHost ? <Button small title="End" variant="danger" onPress={async () => { await api.endLive(id); router.back(); }} style={{ marginRight: 8 }} /> : null} />
      {stream ? (
        <View style={{ marginHorizontal: 16, borderRadius: 32, overflow: 'hidden', aspectRatio: Platform.OS === 'web' ? 16 / 9 : 3 / 4, backgroundColor: '#3b2e25' }}>
          {showVideo
            ? <VideoView stream={isHost ? local : remote} mirror={isHost} style={{ width: '100%', height: '100%' }} />
            : <Image source={stream.coverUrl} style={{ width: '100%', height: '100%', opacity: 0.85 }} contentFit="cover" />}
          <Row gap={8} style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
            <Avatar user={stream.host} size={36} live />
            <Text variant="labelLg" color="#fff" style={{ flex: 1 }} numberOfLines={1}>{stream.host.displayName}</Text>
            <View style={{ backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text variant="labelSm" color="#fff">LIVE</Text></View>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text variant="labelSm" color="#fff">👁 {compact(viewers)}</Text></View>
          </Row>
          <Row gap={8} style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><Text variant="labelSm" color="#fff">🎁 {compact(stream.giftsTotal)}</Text></View>
            {isHost && stream.video ? (
              <>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><Text variant="labelSm" color="#fff">🎥 {videoViewers}/{stream.maxViewers}</Text></View>
                <View style={{ flex: 1 }} />
                <IconButton name={cam ? 'videocam' : 'videocam-off'} label="Camera" bg="rgba(0,0,0,0.5)" color="#fff" size={40} onPress={() => toggle('video')} />
                <IconButton name={mic ? 'mic' : 'mic-off'} label="Microphone" bg="rgba(0,0,0,0.5)" color="#fff" size={40} onPress={() => toggle('audio')} />
                {Platform.OS !== 'web' ? <IconButton name="flip-camera-ios" label="Flip camera" bg="rgba(0,0,0,0.5)" color="#fff" size={40} onPress={() => localRef.current && switchCamera(localRef.current)} /> : null}
              </>
            ) : null}
          </Row>
          {!isHost && !showVideo && STATE_TEXT[vstate as ViewerState] ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
              <View style={{ backgroundColor: 'rgba(255,248,245,0.9)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 }}><Text variant="labelMd" color="#251911">{STATE_TEXT[vstate as ViewerState]}</Text></View>
            </View>
          ) : null}
          {burst ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none"><Text style={{ fontSize: 90, lineHeight: 104 }}>{burst}</Text></View> : null}
          {ended ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', gap: 10 }}>
              <Text variant="headlineLg" color="#fff">Stream ended 🌙</Text>
              <Button small title="See who’s live" onPress={() => router.replace('/live')} />
            </View>
          ) : null}
        </View>
      ) : null}
      <ChatList messages={chat} />
      {!isHost ? (
        <Row gap={6} style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
          {GIFTS.map((g) => (
            <Tap key={g.id} onPress={() => gift(g.id)} style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceContainerLow, borderRadius: 18, paddingVertical: 6 }}>
              <Text style={{ fontSize: 22, lineHeight: 28 }}>{g.emoji}</Text><Text variant="labelSm" color={c.primary} style={{ fontSize: 10 }}>{g.price} ✦</Text>
            </Tap>
          ))}
        </Row>
      ) : null}
      <Composer value={draft} onChange={setDraft} onSend={() => send()} onSticker={(st) => send(st)} placeholder="Say something nice…" />
    </ChatScreen>
  );
}

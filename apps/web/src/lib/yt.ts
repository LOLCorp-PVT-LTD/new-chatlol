/**
 * YouTube IFrame Player API, loaded once and shared by every player in the app (profile songs, music on posts
 * and shouts, the lounge / shoutbox radio). `claimAudio` keeps one source playing at a time: starting a song
 * pauses whatever else was playing.
 */
export type YTPlayer = {
  playVideo: () => void; pauseVideo: () => void; stopVideo: () => void; destroy: () => void; mute: () => void; unMute: () => void; isMuted: () => boolean;
  getCurrentTime: () => number; getDuration: () => number; seekTo: (s: number, allowAhead: boolean) => void; loadVideoById: (o: { videoId: string; startSeconds?: number }) => void;
  setVolume: (v: number) => void; getPlayerState: () => number;
};
export type YTNs = { Player: new (el: HTMLElement, o: object) => YTPlayer; PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number } };

const w = window as unknown as { YT?: YTNs; onYouTubeIframeAPIReady?: () => void; __ytApi?: Promise<YTNs> };
export function loadYouTube(): Promise<YTNs> {
  w.__ytApi ??= new Promise((resolve) => {
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => (prev?.(), resolve(w.YT!));
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.async = true;
    document.head.appendChild(sc);
  });
  return w.__ytApi;
}

/** Player options shared by our compact players. */
export const ytVars = (extra: Record<string, unknown> = {}) => ({ playsinline: 1, controls: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, disablekb: 1, ...extra });

let current: { id: symbol; pause: () => void } | null = null;
/** Call when a player starts: the previous one (if another) is paused. */
export function claimAudio(id: symbol, pause: () => void) {
  if (current && current.id !== id) current.pause();
  current = { id, pause };
}
export function releaseAudio(id: symbol) {
  if (current?.id === id) current = null;
}
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

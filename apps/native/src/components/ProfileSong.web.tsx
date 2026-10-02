import React from 'react';
import type { ProfileSong as Song } from '@chatlol/shared';
import { spotifyEmbedUrl } from '@chatlol/shared';

/** Web / desktop build: Spotify's embed in an iframe (browsers only start sound after a click, so no autoplay here). */
export function ProfileSong({ song }: { song: Song; autoplay?: boolean }) {
  return React.createElement('iframe', {
    src: spotifyEmbedUrl(song),
    title: song.title || 'Profile song',
    width: '100%',
    height: 80,
    style: { border: 0, borderRadius: 14 },
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    loading: 'lazy',
  });
}

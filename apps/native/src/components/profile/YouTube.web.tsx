import React from 'react';

/** Web / desktop build: the YouTube embed in an iframe. */
export function YouTube({ id }: { id: string }) {
  return React.createElement('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${id}`,
    title: 'YouTube video',
    style: { width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 12, background: '#000' },
    allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture',
    allowFullScreen: true,
    loading: 'lazy',
  });
}

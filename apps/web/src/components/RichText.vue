<script setup lang="ts">
import { computed } from 'vue';
import { customEmojiUri, isJumbo, parseRich } from '@chatlol/shared';

/**
 * User text with ChatLOL custom emoji (:code:) drawn as rounded tiles, @mentions linked to profiles and,
 * optionally, #tags highlighted, and web links made clickable. Text that's only 1–3 custom emoji is shown big.
 */
const props = withDefaults(defineProps<{ text: string | null | undefined; tags?: boolean; jumbo?: boolean }>(), { jumbo: true });
const parts = computed(() => parseRich(props.text));
const big = computed(() => props.jumbo && isJumbo(parts.value));
const split = (v: string) => (props.tags ? v.split(/(#[\p{L}\p{N}_]+)/u).filter(Boolean) : [v]);

/**
 * Links: http(s):// and www. addresses become clickable. Links to ChatLOL itself open in-app; everything else opens
 * in a new tab, marked nofollow/ugc. Trailing punctuation ("see this.") isn't part of the link.
 */
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
type Seg = { link: true; href: string; label: string; internal: string | null } | { link: false; v: string };
function links(v: string): Seg[] {
  const out: Seg[] = [];
  for (const piece of v.split(URL_RE)) {
    if (!piece) continue;
    if (!/^(?:https?:\/\/|www\.)/i.test(piece)) {
      out.push({ link: false, v: piece });
      continue;
    }
    const m = piece.match(/^(.*?)([.,!?;:'")\]]*)$/)!;
    const raw = m[1];
    let url: URL | null = null;
    try { url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw); } catch { /* not a real link */ }
    if (!url || !/^https?:$/.test(url.protocol) || (!url.hostname.includes('.') && url.host !== location.host)) {
      out.push({ link: false, v: piece });
      continue;
    }
    const label = (url.hostname.replace(/^www\./, '') + (url.pathname === '/' ? '' : url.pathname) + url.search).replace(/(.{42}).+/, '$1…');
    out.push({ link: true, href: url.href, label, internal: url.host === location.host ? url.pathname + url.search + url.hash : null });
    if (m[2]) out.push({ link: false, v: m[2] });
  }
  return out;
}
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <img v-if="p.t === 'emoji'" :src="customEmojiUri(p.code)" :alt="`:${p.code}:`" :title="`:${p.code}:`" class="cemoji" :class="{ 'cemoji-big': big }" draggable="false" />
    <RouterLink v-else-if="p.t === 'mention'" :to="`/u/${p.handle}`" class="font-bold hover:underline text-primary">@{{ p.handle }}</RouterLink>
    <template v-else>
      <template v-for="(seg, j) in split(p.v)" :key="j">
        <RouterLink v-if="tags && seg.startsWith('#')" :to="`/feed?tag=${seg.slice(1).toLowerCase()}`" class="text-primary font-bold hover:underline">{{ seg }}</RouterLink>
        <template v-else>
          <template v-for="(l, k) in links(seg)" :key="k">
            <RouterLink v-if="l.link && l.internal" :to="l.internal" class="rt-link" @click.stop>{{ l.label }}</RouterLink>
            <a v-else-if="l.link" :href="l.href" target="_blank" rel="noopener noreferrer nofollow ugc" class="rt-link" :title="l.href" @click.stop>{{ l.label }}</a>
            <template v-else>{{ l.v }}</template>
          </template>
        </template>
      </template>
    </template>
  </template>
</template>

<style scoped>
.cemoji { display: inline-block; width: 1.35em; height: 1.35em; vertical-align: -0.3em; margin: 0 0.05em; border-radius: 24%; }
.rt-link { color: rgb(var(--c-primary)); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; word-break: break-all; }
.rt-link:hover { text-decoration-thickness: 2px; }
.cemoji-big { width: 3.4rem; height: 3.4rem; vertical-align: middle; margin: 2px; }
</style>

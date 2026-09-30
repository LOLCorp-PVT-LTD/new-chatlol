<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { RouletteCard, RouletteResult, VibeScore } from '@chatlol/shared';
import { comboMultiplier, tierByKey, TIERS } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti, ding, buzz } from '../lib/fx';
import TierPad from '../components/TierPad.vue';
import TierBars from '../components/TierBars.vue';
import Avatar from '../components/Avatar.vue';
import UserName from '../components/UserName.vue';
import Icon from '../components/Icon.vue';
import Progress from '../components/Progress.vue';
import Empty from '../components/Empty.vue';

const s = useSession();
const card = ref<RouletteCard | null>(null);
const result = ref<RouletteResult | null>(null);
const vote = ref<VibeScore | null>(null);
const loading = ref(true);
const combo = ref(s.user?.comboCount ?? 0);
const imgLoaded = ref(false);
let nextTimer: ReturnType<typeof setTimeout> | undefined;

async function next() {
  clearTimeout(nextTimer);
  loading.value = true;
  result.value = null;
  vote.value = null;
  imgLoaded.value = false;
  card.value = await api.rouletteNext();
  loading.value = false;
}

async function rate(v: VibeScore) {
  if (!card.value || result.value) return;
  vote.value = v;
  try {
    const r = await api.rouletteVote(card.value.post.id, v);
    result.value = r;
    combo.value = r.comboCount;
    if (s.user) { s.user.comboCount = r.comboCount; s.user.dailyGoal.done = Math.min(s.user.dailyGoal.target, s.user.dailyGoal.done + 1); }
    if (r.match) { ding('match'); buzz([10, 40, 20]); if (r.comboCount >= 3) confetti(undefined, window.innerHeight * 0.4, 20 + r.comboCount * 4); }
    s.reward(r.reward);
    nextTimer = setTimeout(next, r.match ? 2200 : 1800);
  } catch (e) {
    s.toast({ kind: 'error', title: (e as Error).message });
    void next();
  }
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  const n = Number(e.key);
  if (n >= 1 && n <= 5) rate(n as VibeScore);
  if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); void next(); }
}
onMounted(() => { void next(); window.addEventListener('keydown', onKey); });
onUnmounted(() => { window.removeEventListener('keydown', onKey); clearTimeout(nextTimer); });
</script>

<template>
  <div class="max-w-[560px] mx-auto space-y-4">
    <!-- Oracle hub -->
    <div class="rounded-lg bg-surface-container-low p-4 space-y-3 shadow-warm">
      <div class="flex items-center justify-between">
        <span class="flex items-center gap-1.5 bg-flame text-white px-3 py-1 rounded-full shadow-glow text-label-sm uppercase">
          <Icon name="local_fire_department" :size="16" fill /> Combo {{ combo }}x
          <span class="bg-white/25 rounded-full px-1.5">{{ comboMultiplier(combo).toFixed(2).replace(/\.?0+$/, '') }}x</span>
        </span>
        <span class="text-label-sm text-secondary flex items-center gap-1"><Icon name="keyboard" :size="16" /> Keys 1–5 to rate, space to skip</span>
      </div>
      <div v-if="s.user">
        <div class="flex justify-between text-label-md mb-1.5">
          <span class="flex items-center gap-1.5"><Icon name="military_tech" class="text-flame" :size="18" /> Solo Quest: Daily Oracle</span>
          <span class="text-secondary"><b class="text-headline-sm text-primary">{{ s.user.dailyGoal.done }}</b>/{{ s.user.dailyGoal.target }} (+100 ✦ chest)</span>
        </div>
        <Progress :value="s.user.dailyGoal.done" :max="s.user.dailyGoal.target" />
      </div>
    </div>

    <div v-if="loading && !card" class="card aspect-[4/5] skeleton" />
    <Empty v-else-if="!card" emoji="🎰" title="You’ve rated everything!" body="Fresh vibes drop every few minutes. Post your own to join the deck.">
      <button class="btn-primary" @click="next">Check again</button>
    </Empty>

    <template v-else>
      <div class="relative rounded-xl overflow-hidden bg-surface-container shadow-pop">
        <div class="relative aspect-[4/5]">
          <img :src="card.post.mediaUrl!" :alt="card.post.body" class="w-full h-full object-cover transition-opacity duration-300" :class="imgLoaded ? 'opacity-100' : 'opacity-0'" @load="imgLoaded = true" />
          <div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/90 via-transparent to-black/30" />
          <div class="absolute top-4 inset-x-4 flex justify-between">
            <span v-if="card.post.soundtrack" class="glass rounded-full px-3 py-1.5 text-label-sm flex items-center gap-1.5"><Icon name="graphic_eq" class="text-flame" :size="16" />{{ card.post.soundtrack }}</span><span v-else />
            <span class="glass rounded-full px-2.5 py-1 text-label-sm flex items-center gap-1"><Icon name="shuffle" class="text-secondary-container" :size="16" />#{{ card.queuePosition }}</span>
          </div>
          <div class="absolute bottom-16 inset-x-4 text-white">
            <RouterLink :to="`/u/${card.post.author.handle}`" class="flex items-center gap-2">
              <Avatar :user="card.post.author" :size="36" />
              <UserName :user="card.post.author" :link="false" class="text-headline-sm drop-shadow" />
              <span class="text-label-sm bg-white/25 backdrop-blur rounded-full px-2 py-0.5">{{ card.post.author.city || 'Somewhere' }}</span>
            </RouterLink>
            <p class="text-body-md mt-1 drop-shadow line-clamp-2">{{ card.post.body }}</p>
          </div>
          <div class="absolute bottom-0 inset-x-0 glass px-4 py-2.5 flex items-center justify-between">
            <template v-if="!result">
              <span class="text-label-sm flex items-center gap-2"><span class="w-7 h-7 rounded-full bg-secondary-container text-white flex items-center justify-center"><Icon name="lock" :size="16" /></span>Rate below to unveil consensus & Sparks!</span>
              <span class="text-label-sm text-primary uppercase tracking-wider">Blind Verdict</span>
            </template>
            <template v-else>
              <span class="text-label-lg">{{ tierByKey(result.ratings.tier).emoji }} Crowd says {{ tierByKey(result.communityTier).label }}</span>
              <span class="text-label-sm text-on-surface-variant">{{ result.ratings.count }} votes</span>
            </template>
          </div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between px-1 mb-2">
          <span class="label">Lock in your vibe</span>
          <span class="text-label-sm text-primary flex items-center gap-0.5"><Icon name="bolt" :size="14" /> Match the crowd: +{{ Math.round(15 * comboMultiplier(combo + 1)) }} ✦</span>
        </div>
        <TierPad :model-value="vote" :disabled="!!result" @rate="rate" />
      </div>

      <Transition name="slide-up">
        <div v-if="result" class="rounded-xl p-4 shadow-pop" :class="result.match ? 'bg-sunset text-white' : 'bg-surface-container-high'">
          <div class="flex items-center gap-3">
            <span class="w-12 h-12 rounded-full flex items-center justify-center text-2xl" :class="result.match ? 'bg-white/25' : 'bg-surface-container-lowest'">{{ result.match ? '🎯' : TIERS[vote! - 1].emoji }}</span>
            <div class="flex-1">
              <p class="text-headline-md">{{ result.match ? `Match! ${result.comboCount}x combo` : 'Bold take!' }}</p>
              <p class="text-body-sm" :class="result.match ? 'opacity-90' : 'text-on-surface-variant'">Community verdict: <b>{{ result.consensusPct }}% {{ tierByKey(result.communityTier).label }} {{ tierByKey(result.communityTier).emoji }}</b></p>
            </div>
            <span class="rounded-full px-3 py-1 text-label-lg" :class="result.match ? 'bg-white text-flame' : 'bg-primary-fixed text-on-primary-fixed'">+{{ result.sparksEarned }} ✦</span>
          </div>
          <div class="mt-4 rounded-md p-3" :class="result.match ? 'bg-white/15' : 'bg-surface-container-lowest'"><TierBars :ratings="result.ratings" /></div>
          <div class="flex gap-2 mt-3">
            <RouterLink :to="`/p/${card.post.id}`" class="btn flex-1 h-10" :class="result.match ? 'bg-white/20 text-white' : 'btn-secondary'"><Icon name="chat_bubble" :size="18" /> Comment</RouterLink>
            <button class="btn flex-1 h-10" :class="result.match ? 'bg-white text-flame' : 'btn-primary'" @click="next">Next <Icon name="skip_next" :size="18" /></button>
          </div>
        </div>
      </Transition>
      <button v-if="!result" class="btn-ghost w-full" @click="next"><Icon name="skip_next" /> Skip</button>
    </template>
  </div>
</template>

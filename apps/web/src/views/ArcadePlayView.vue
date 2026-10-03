<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { UserPublic } from '@chatlol/shared';
import { ARCADE, towerX } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti, ding } from '../lib/fx';
import Avatar from '../components/Avatar.vue';

/**
 * Plays one arcade game. A fixed-step loop runs the shared simulation and records each input against its tick —
 * exactly what the server replays to score the run. Keyboard, mouse and touch (swipes for snake / 2048).
 */
const route = useRoute();
const s = useSession();
const key = route.params.game as 'snake' | 'flight' | '2048' | 'tower';
const g = ARCADE[key];
const canvas = ref<HTMLCanvasElement>();
const phase = ref<'ready' | 'playing' | 'over'>('ready');
const score = ref(0);
const result = ref<Awaited<ReturnType<typeof api.arcadeFinish>> | null>(null);
const board = ref<{ rank: number; user: UserPublic; score: number }[]>([]);
const period = ref<'day' | 'week' | 'all'>('all');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let st: any = null;
let runId = '';
let tick = 0;
let inputs: [number, string][] = [];
let queued: string | null = null;
let acc = 0;
let lastT = 0;
let raf = 0;

async function loadBoard() {
  board.value = (await api.arcadeLeaderboard(key, period.value)).entries;
}
async function start() {
  if (!s.user) return s.toast({ kind: 'info', title: 'Sign in to play for the leaderboard' });
  const r = await api.arcadeStart(key);
  runId = r.runId;
  st = g.init(r.seed);
  tick = 0;
  inputs = [];
  queued = null;
  acc = 0;
  lastT = performance.now();
  score.value = 0;
  result.value = null;
  phase.value = 'playing';
  if (key === 'flight') press('flap');
}
function press(v: string) {
  if (phase.value !== 'playing') return;
  if (key === '2048') {
    // Turn-based: each move is its own step.
    inputs.push([inputs.length, v]);
    st = g.step(st, v);
    score.value = g.score(st);
    if (g.over(st)) void finish();
    return;
  }
  queued = v;
}
function frame(t: number) {
  if (phase.value === 'playing' && key !== '2048') {
    acc += Math.min(250, t - lastT);
    lastT = t;
    while (acc >= g.TICK_MS && phase.value === 'playing') {
      acc -= g.TICK_MS;
      const input = queued;
      queued = null;
      if (input) inputs.push([tick, input]);
      st = g.step.call(g, st, input);
      tick++;
      score.value = g.score(st);
      if (g.over(st)) void finish();
    }
  }
  draw();
  raf = requestAnimationFrame(frame);
}
async function finish() {
  phase.value = 'over';
  try {
    result.value = await api.arcadeFinish(runId, inputs);
    if (result.value.newBest) (confetti(), ding('level'));
    if (result.value.reward) s.reward(result.value.reward);
    await loadBoard();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}

// ——— Rendering ———
const TILE: Record<number, string> = { 2: '#fff1e6', 4: '#ffe0c2', 8: '#ffb877', 16: '#ff9a4d', 32: '#ff7a3d', 64: '#ff5e00', 128: '#ffd166', 256: '#fcc419', 512: '#f59f00', 1024: '#e67700', 2048: '#d9480f' };
function draw() {
  const c = canvas.value;
  if (!c) return;
  const x = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, W, H);
  if (!st) {
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#f472b6');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.font = `${W / 6}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(g.emoji, W / 2, H / 2);
    return;
  }
  if (key === 'snake') {
    const n = g.N!;
    const k = W / n;
    x.fillStyle = '#0f172a'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) (x.fillStyle = '#131c33'), x.fillRect(i * k, j * k, k, k);
    const pulse = 0.8 + Math.sin(performance.now() / 150) * 0.15;
    x.fillStyle = '#fde047'; x.shadowColor = '#fde047'; x.shadowBlur = 16;
    x.beginPath(); x.arc((st.food[0] + 0.5) * k, (st.food[1] + 0.5) * k, (k / 2.6) * pulse, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
    st.body.forEach(([bx, by]: number[], i: number) => {
      x.fillStyle = `hsl(${22 + i * 3} 100% ${60 - Math.min(25, i)}%)`;
      x.beginPath(); x.roundRect(bx * k + 1.5, by * k + 1.5, k - 3, k - 3, k / 3); x.fill();
    });
  } else if (key === 'flight') {
    const C = g.C!;
    const sx = W / C.W;
    x.scale(sx, sx);
    const bg = x.createLinearGradient(0, 0, 0, C.H);
    bg.addColorStop(0, '#ff9a6b'); bg.addColorStop(1, '#7c3aed');
    x.fillStyle = bg; x.fillRect(0, 0, C.W, C.H);
    for (const p of st.pipes) {
      x.fillStyle = '#16a34a';
      x.beginPath(); x.roundRect(p.x, -10, C.PIPE_W, p.gapY + 10, 10); x.fill();
      x.beginPath(); x.roundRect(p.x, p.gapY + C.GAP, C.PIPE_W, C.H, 10); x.fill();
      x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(p.x + 8, 0, 8, C.H);
    }
    x.save(); x.translate(C.X, st.y); x.rotate(Math.max(-0.5, Math.min(1, st.vy / 10)));
    x.font = '34px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🐥', 0, 0); x.restore();
  } else if (key === '2048') {
    const k = W / 4;
    x.fillStyle = '#e7d8c9'; x.beginPath(); x.roundRect(0, 0, W, H, 18); x.fill();
    st.grid.forEach((v: number, i: number) => {
      const gx = (i % 4) * k;
      const gy = Math.floor(i / 4) * k;
      x.fillStyle = v ? (TILE[v] ?? '#3b0764') : '#f5ebe0';
      x.beginPath(); x.roundRect(gx + 8, gy + 8, k - 16, k - 16, 14); x.fill();
      if (v) { x.fillStyle = v <= 4 ? '#5b4137' : '#fff'; x.font = `600 ${v >= 1024 ? k / 4 : k / 3}px Manrope, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(v), gx + k / 2, gy + k / 2 + 2); }
    });
  } else if (key === 'tower') {
    const sx = W / 600;
    x.scale(sx, sx);
    const h = H / sx;
    const bg = x.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#ec4899');
    x.fillStyle = bg; x.fillRect(0, 0, 600, h);
    const BH = 26;
    const cam = Math.max(0, (st.stack.length - 10) * BH);
    st.stack.forEach((b: { x: number; w: number }, i: number) => {
      x.fillStyle = `hsl(${(i * 23) % 360} 85% 60%)`;
      x.beginPath(); x.roundRect(b.x, h - (i + 1) * BH + cam, b.w, BH - 2, 4); x.fill();
    });
    if (phase.value === 'playing') {
      const top = st.stack.at(-1);
      const bx = towerX(top.w, st.stack.length, st.since * g.TICK_MS);
      x.fillStyle = `hsl(${(st.stack.length * 23) % 360} 85% 60%)`;
      x.beginPath(); x.roundRect(bx, h - (st.stack.length + 1.6) * BH + cam, top.w, BH - 2, 4); x.fill();
    }
  }
}

// ——— Input ———
const KEYS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
function onKey(e: KeyboardEvent) {
  if (phase.value !== 'playing') return;
  if ((key === 'snake' || key === '2048') && KEYS[e.key]) (e.preventDefault(), press(KEYS[e.key]));
  if ((key === 'flight' || key === 'tower') && (e.code === 'Space' || e.key === 'ArrowUp')) (e.preventDefault(), press(key === 'flight' ? 'flap' : 'drop'));
}
let touch: { x: number; y: number } | null = null;
function onDown(e: PointerEvent) {
  touch = { x: e.clientX, y: e.clientY };
  if (key === 'flight' || key === 'tower') press(key === 'flight' ? 'flap' : 'drop');
}
function onUp(e: PointerEvent) {
  if (!touch || (key !== 'snake' && key !== '2048')) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
}
function resize() {
  const c = canvas.value!;
  const w = c.clientWidth * devicePixelRatio;
  c.width = w;
  c.height = key === 'flight' ? w * 1.5 : key === 'tower' ? w * 1.2 : w;
}
onMounted(() => {
  resize();
  addEventListener('resize', resize);
  addEventListener('keydown', onKey);
  raf = requestAnimationFrame(frame);
  void loadBoard();
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  removeEventListener('resize', resize);
  removeEventListener('keydown', onKey);
});
const HOW: Record<string, string> = { snake: 'Arrow keys or swipe', flight: 'Space, click or tap to flap', '2048': 'Arrow keys or swipe', tower: 'Space, click or tap to drop' };
const aspect = computed(() => (key === 'flight' ? '2 / 3' : key === 'tower' ? '5 / 6' : '1 / 1'));
</script>

<template>
  <div class="max-w-[1000px] mx-auto grid lg:grid-cols-[1fr_300px] gap-4 items-start">
    <section class="card p-4 space-y-3">
      <div class="flex items-center justify-between"><h1 class="text-headline-md">{{ g.emoji }} {{ g.name }}</h1><span class="text-headline-md tabular-nums">{{ score.toLocaleString() }}</span></div>
      <div class="relative mx-auto w-full" :style="{ maxWidth: key === 'flight' ? '380px' : '480px' }">
        <canvas ref="canvas" class="w-full rounded-[22px] touch-none select-none shadow-float" :style="{ aspectRatio: aspect }" @pointerdown="onDown" @pointerup="onUp" />
        <div v-if="phase !== 'playing'" class="absolute inset-0 rounded-[22px] bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center text-white text-center p-6 gap-3">
          <template v-if="phase === 'over' && result">
            <p class="text-headline-lg">{{ result.newBest ? '🏆 New best!' : 'Game over' }}</p>
            <p class="text-headline-xl tabular-nums">{{ result.score.toLocaleString() }}</p>
            <p class="text-body-md opacity-90">Best {{ result.best.toLocaleString() }} · rank #{{ result.rank }}<template v-if="result.reward"> · +{{ result.reward.sparks }} ✦</template></p>
            <p v-if="result.rejected" class="text-body-sm text-red-200">That run couldn’t be verified, so it wasn’t scored.</p>
          </template>
          <template v-else-if="phase === 'over'"><p class="text-headline-md">Scoring…</p></template>
          <template v-else><p class="text-headline-lg">{{ g.name }}</p><p class="text-body-md opacity-90">{{ g.desc }}</p><p class="text-label-md opacity-80">{{ HOW[key] }}</p></template>
          <button class="btn bg-white text-flame h-11" @click="start">{{ phase === 'over' ? 'Play again' : 'Play' }}</button>
        </div>
      </div>
      <RouterLink to="/arcade" class="text-label-md text-on-surface-variant">← All arcade games</RouterLink>
    </section>
    <aside class="card p-4 space-y-3">
      <div class="flex items-center gap-1.5"><p class="label flex-1">Leaderboard</p>
        <button v-for="p in (['day', 'week', 'all'] as const)" :key="p" class="chip h-7 text-label-sm" :class="{ 'chip-active': period === p }" @click="period = p; loadBoard()">{{ p === 'all' ? 'All time' : p === 'week' ? 'Week' : 'Today' }}</button></div>
      <TransitionGroup name="rank" tag="ol" class="space-y-1.5">
        <li v-for="e in board" :key="e.user.id" class="flex items-center gap-2 rounded-md px-2 py-1.5" :class="e.user.id === s.user?.id ? 'bg-sunlit' : ''">
          <span class="w-6 text-center font-semibold">{{ e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank }}</span>
          <Avatar :user="e.user" :size="28" :show-online="false" />
          <span class="flex-1 truncate text-label-md">{{ e.user.displayName }}</span>
          <span class="tabular-nums font-semibold">{{ e.score.toLocaleString() }}</span>
        </li>
      </TransitionGroup>
      <p v-if="!board.length" class="text-body-sm text-on-surface-variant">No scores yet — be the first!</p>
    </aside>
  </div>
</template>

<style scoped>
.rank-move { transition: transform 0.4s; }
</style>

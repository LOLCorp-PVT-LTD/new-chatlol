<script setup lang="ts">
import AdSlot from '../components/AdSlot.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { UserPublic } from '@chatlol/shared';
import { ARCADE, ARCADE_ECONOMY, towerX } from '@chatlol/shared';
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
  if ((s.user.sparks ?? 0) < ARCADE_ECONOMY.entry) return s.toast({ kind: 'error', title: `A run costs ✦${ARCADE_ECONOMY.entry}`, body: 'Earn a few more Sparks and come back!' });
  let r: Awaited<ReturnType<typeof api.arcadeStart>>;
  try { r = await api.arcadeStart(key); } catch (e) { return s.toast({ kind: 'error', title: (e as Error).message }); }
  s.spend(ARCADE_ECONOMY.entry);
  runId = r.runId;
  st = g.init(r.seed);
  tick = 0;
  inputs = [];
  queued = null;
  anim = null;
  bump = null;
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
    const before = [...st.grid];
    const plan = slides2048(before, v);
    st = g.step(st, v);
    if (st.grid.join() !== before.join()) {
      const dests = new Set(plan.moves.map((m) => m.b));
      anim = { moves: plan.moves, merged: plan.merged, spawned: new Set(st.grid.map((x: number, i: number) => (x && !dests.has(i) ? i : -1)).filter((i: number) => i >= 0)), t0: performance.now() };
    } else bump = { dir: v, t0: performance.now() }; // nothing moved: a little nudge so you know it registered
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

// ——— 2048 motion: tiles slide to where they land, merges pop, new tiles grow in ———
type Slide = { v: number; a: number; b: number };
let anim: { moves: Slide[]; merged: Set<number>; spawned: Set<number>; t0: number } | null = null;
let bump: { dir: string; t0: number } | null = null;
const SLIDE_MS = 110;
const POP_MS = 160;
/** Mirrors the engine's merge rule to work out where every tile travels for a move. */
function slides2048(grid: number[], dir: string) {
  const moves: Slide[] = [];
  const merged = new Set<number>();
  for (let i = 0; i < 4; i++) {
    const idx = [0, 1, 2, 3].map((j) => ({ left: i * 4 + j, right: i * 4 + 3 - j, up: j * 4 + i, down: (3 - j) * 4 + i } as Record<string, number>)[dir]);
    const tiles = idx.filter((k) => grid[k]);
    let pos = 0;
    for (let n = 0; n < tiles.length; n++) {
      const k = tiles[n];
      if (n + 1 < tiles.length && grid[k] === grid[tiles[n + 1]]) {
        moves.push({ v: grid[k], a: k, b: idx[pos] }, { v: grid[k], a: tiles[n + 1], b: idx[pos] });
        merged.add(idx[pos]);
        n++;
      } else moves.push({ v: grid[k], a: k, b: idx[pos] });
      pos++;
    }
  }
  return { moves, merged };
}
/** Live drag (pointer held down): the board leans toward the swipe and an arrow shows which way it will go. */
const drag = { on: false, dx: 0, dy: 0 };
const DIR_VEC: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const dragDir = () => (Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) < 24 ? null : Math.abs(drag.dx) > Math.abs(drag.dy) ? (drag.dx > 0 ? 'right' : 'left') : drag.dy > 0 ? 'down' : 'up');
const ease = (t: number) => 1 - (1 - t) ** 3;

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
    const sd = drag.on ? dragDir() : null;
    if (sd) drawSwipeHint(x, W, H, sd);
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
    const now = performance.now();
    const dpr = devicePixelRatio;
    x.fillStyle = '#e7d8c9'; x.beginPath(); x.roundRect(0, 0, W, H, 18 * dpr); x.fill();
    for (let i = 0; i < 16; i++) { x.fillStyle = '#f5ebe0'; x.beginPath(); x.roundRect((i % 4) * k + 8, Math.floor(i / 4) * k + 8, k - 16, k - 16, 14); x.fill(); }
    // Lean: rubber-banded offset along the swipe axis while dragging, or a short nudge for a move that did nothing.
    let ox = 0;
    let oy = 0;
    const dir = drag.on ? dragDir() : null;
    if (dir) {
      const [vx, vy] = DIR_VEC[dir];
      const d = Math.abs(vx ? drag.dx : drag.dy) * dpr;
      const lean = (k * 0.22 * d) / (d + k);
      ox = vx * lean; oy = vy * lean;
    } else if (bump) {
      const t = (now - bump.t0) / 220;
      if (t >= 1) bump = null;
      else { const [vx, vy] = DIR_VEC[bump.dir]; const a = Math.sin(t * Math.PI) * k * 0.06; ox = vx * a; oy = vy * a; }
    }
    const tile = (v: number, cx: number, cy: number, scale = 1, alpha = 1) => {
      const sz = (k - 16) * scale;
      x.globalAlpha = alpha;
      x.fillStyle = TILE[v] ?? '#3b0764';
      x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 8 * dpr; x.shadowOffsetY = 2 * dpr;
      x.beginPath(); x.roundRect(cx - sz / 2, cy - sz / 2, sz, sz, 14 * scale); x.fill();
      x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
      x.fillStyle = v <= 4 ? '#5b4137' : '#fff'; x.font = `600 ${(v >= 1024 ? k / 4 : k / 3) * scale}px Manrope, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(v), cx, cy + 2);
      x.globalAlpha = 1;
    };
    const centre = (i: number) => [(i % 4) * k + k / 2 + ox, Math.floor(i / 4) * k + k / 2 + oy];
    const t = anim ? (now - anim.t0) / SLIDE_MS : 2;
    if (anim && t < 1) {
      // Sliding: old tiles travel to their landing squares.
      const e = ease(t);
      for (const m of anim.moves) {
        const [ax, ay] = centre(m.a);
        const [bx, by] = centre(m.b);
        tile(m.v, ax + (bx - ax) * e, ay + (by - ay) * e);
      }
    } else {
      const p = anim ? (now - anim.t0 - SLIDE_MS) / POP_MS : 1;
      if (anim && p >= 1) anim = null;
      st.grid.forEach((v: number, i: number) => {
        if (!v) return;
        const [cx, cy] = centre(i);
        let sc = 1;
        if (anim?.merged.has(i)) sc = 1 + 0.14 * Math.sin(Math.min(1, p) * Math.PI);
        if (anim?.spawned.has(i)) sc = ease(Math.min(1, Math.max(0, p)));
        if (sc > 0.02) tile(v, cx, cy, sc);
      });
    }
    if (dir) drawSwipeHint(x, W, H, dir);
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

/** Edge glow and a chevron for the direction the current drag will move in. */
function drawSwipeHint(x: CanvasRenderingContext2D, W: number, H: number, dir: string) {
  const [vx, vy] = DIR_VEC[dir];
  const g2 = x.createLinearGradient(vx > 0 ? W : vx < 0 ? 0 : W / 2, vy > 0 ? H : vy < 0 ? 0 : H / 2, W / 2, H / 2);
  g2.addColorStop(0, 'rgba(255,122,61,.45)'); g2.addColorStop(0.35, 'rgba(255,122,61,0)');
  x.fillStyle = g2; x.fillRect(0, 0, W, H);
  x.save();
  x.translate(W / 2, H / 2); x.rotate(Math.atan2(vy, vx));
  const r = W * 0.09;
  x.globalAlpha = 0.85; x.fillStyle = 'rgba(0,0,0,.35)';
  x.beginPath(); x.arc(0, 0, r * 1.25, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = r * 0.28; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(-r * 0.35, -r * 0.55); x.lineTo(r * 0.35, 0); x.lineTo(-r * 0.35, r * 0.55); x.stroke();
  x.restore();
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
  if (key === 'flight' || key === 'tower') return press(key === 'flight' ? 'flap' : 'drop');
  // Keep receiving moves and the release even if the finger leaves the board.
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  Object.assign(drag, { on: phase.value === 'playing', dx: 0, dy: 0 });
}
function onMove(e: PointerEvent) {
  if (!touch || !drag.on) return;
  drag.dx = e.clientX - touch.x;
  drag.dy = e.clientY - touch.y;
}
function onUp(e: PointerEvent) {
  drag.on = false;
  if (!touch || (key !== 'snake' && key !== '2048')) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
}
function onCancel() { touch = null; drag.on = false; }
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
        <canvas ref="canvas" class="w-full rounded-[22px] touch-none select-none shadow-float" :style="{ aspectRatio: aspect }" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onCancel" />
        <div v-if="phase !== 'playing'" class="absolute inset-0 rounded-[22px] bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center text-white text-center p-6 gap-3">
          <template v-if="phase === 'over' && result">
            <p class="text-headline-lg">{{ result.newBest ? '🏆 New best!' : 'Game over' }}</p>
            <p class="text-headline-xl tabular-nums">{{ result.score.toLocaleString() }}</p>
            <p class="text-body-md opacity-90">Best {{ result.best.toLocaleString() }} · rank #{{ result.rank }}<template v-if="result.reward"> · +{{ result.reward.sparks.toLocaleString() }} ✦</template></p>
            <p v-if="result.rejected" class="text-body-sm text-red-200">That run couldn’t be verified, so it wasn’t scored.</p>
          </template>
          <template v-else-if="phase === 'over'"><p class="text-headline-md">Scoring…</p></template>
          <template v-else><p class="text-headline-lg">{{ g.name }}</p><p class="text-body-md opacity-90">{{ g.desc }}</p><p class="text-label-md opacity-80">{{ HOW[key] }}</p></template>
          <button class="btn bg-white text-flame h-11" @click="start">{{ phase === 'over' ? 'Play again' : 'Play' }} · ✦{{ ARCADE_ECONOMY.entry }}</button>
          <p class="text-label-sm opacity-80">Every point pays ✦{{ s.user?.premium ? ARCADE_ECONOMY.perPointPremium : ARCADE_ECONOMY.perPoint }}{{ s.user?.premium ? ' (Premium)' : ` · ✦${ARCADE_ECONOMY.perPointPremium} with Premium` }}</p>
          <AdSlot v-if="phase === 'over'" placement="arcade_gameover" class="w-full max-w-[300px] bg-white/90" />
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

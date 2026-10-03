<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Arena } from '@chatlol/shared';
import { POCKETS, POOL, simulateShot } from '@chatlol/shared';
import PlayerStrip from './PlayerStrip.vue';

/**
 * 8-ball pool on a canvas. Move the mouse / finger to aim (a guide line shows the path), hold and pull back for
 * power, release to shoot. Every shot is replayed with the same physics the server used, so all players see the
 * exact same animation.
 */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type Ball = { id: number; x: number; y: number; in: boolean };
type PS = { balls: Ball[]; turn: number; groups: (string | null)[]; ballInHand: boolean; lastShot: { seat: number; before: Ball[]; angle: number; power: number } | null; log: string[] };
const st = computed(() => props.arena.state as unknown as PS);
const canvas = ref<HTMLCanvasElement>();
const aim = ref(0);
const power = ref(0);
const charging = ref(false);
const cuePos = ref<{ x: number; y: number } | null>(null);
let shown: Ball[] = [];
let anim: { frames: number[][][]; i: number } | null = null;
let raf = 0;
const PAD = 34;
const COLORS = ['#ffffff', '#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d', '#111111'];
const colorOf = (id: number) => COLORS[id > 8 ? id - 8 : id];

function toTable(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect();
  const sx = (POOL.W + PAD * 2) / r.width;
  return { x: (e.clientX - r.left) * sx - PAD, y: (e.clientY - r.top) * sx - PAD };
}
const cue = () => shown.find((b) => b.id === 0)!;

function draw() {
  const c = canvas.value;
  if (!c) return;
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  const k = c.width / (POOL.W + PAD * 2);
  g.scale(k, k);
  // Rails and cloth.
  g.fillStyle = '#5a2e12';
  g.beginPath(); g.roundRect(0, 0, POOL.W + PAD * 2, POOL.H + PAD * 2, 28); g.fill();
  g.translate(PAD, PAD);
  const cloth = g.createRadialGradient(POOL.W / 2, POOL.H / 2, 50, POOL.W / 2, POOL.H / 2, POOL.W * 0.7);
  cloth.addColorStop(0, '#1f9d5a'); cloth.addColorStop(1, '#0d5c33');
  g.fillStyle = cloth; g.fillRect(0, 0, POOL.W, POOL.H);
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(POOL.W / 4, 0); g.lineTo(POOL.W / 4, POOL.H); g.stroke();
  g.fillStyle = '#050505';
  for (const [x, y] of POCKETS) { g.beginPath(); g.arc(x, y, POOL.POCKET, 0, Math.PI * 2); g.fill(); }
  // Aim guide.
  if (props.myTurn && !anim) {
    const cb = cuePos.value ?? cue();
    g.setLineDash([8, 8]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cb.x, cb.y); g.lineTo(cb.x + Math.cos(aim.value) * 600, cb.y + Math.sin(aim.value) * 600); g.stroke(); g.setLineDash([]);
    // Cue stick, pulled back with power.
    const back = 20 + power.value * 90;
    g.strokeStyle = '#d9a066'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cb.x - Math.cos(aim.value) * back, cb.y - Math.sin(aim.value) * back); g.lineTo(cb.x - Math.cos(aim.value) * (back + 320), cb.y - Math.sin(aim.value) * (back + 320)); g.stroke();
  }
  for (const b of shown) {
    if (b.in) continue;
    const p = b.id === 0 && cuePos.value && !anim ? cuePos.value : b;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
    g.fillStyle = colorOf(b.id); g.beginPath(); g.arc(p.x, p.y, POOL.R, 0, Math.PI * 2); g.fill();
    g.restore();
    if (b.id > 8) { g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, POOL.R, -0.6, 0.6); g.arc(p.x, p.y, POOL.R, Math.PI - 0.6, Math.PI + 0.6); g.fill(); }
    if (b.id > 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, 5.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(b.id), p.x, p.y + 0.5); }
    const hl = g.createRadialGradient(p.x - 4, p.y - 4, 1, p.x, p.y, POOL.R);
    hl.addColorStop(0, 'rgba(255,255,255,.7)'); hl.addColorStop(0.4, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.arc(p.x, p.y, POOL.R, 0, Math.PI * 2); g.fill();
  }
  if (charging.value) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(c.width - 30, 20, 14, 160);
    g.fillStyle = `hsl(${120 - power.value * 120} 90% 50%)`; g.fillRect(c.width - 30, 180 - power.value * 160, 14, power.value * 160);
  }
}

function loop() {
  if (anim) {
    const f = anim.frames[anim.i];
    if (f) shown = shown.map((b, k) => ({ ...b, x: f[k][0], y: f[k][1], in: !!f[k][2] }));
    anim.i += 1;
    if (anim.i >= anim.frames.length) {
      anim = null;
      shown = st.value.balls.map((b) => ({ ...b }));
    }
  }
  if (charging.value) power.value = Math.min(1, power.value + 0.012);
  draw();
  raf = requestAnimationFrame(loop);
}

// A new shot arrived: replay it from the position before the shot with the shared physics.
watch(() => st.value.lastShot, (shot, old) => {
  if (!shot || shot === old) return void (shown = st.value.balls.map((b) => ({ ...b })));
  const r = simulateShot(shot.before, shot.angle, shot.power, { frames: true });
  shown = shot.before.map((b) => ({ ...b }));
  anim = { frames: r.frames, i: 0 };
  cuePos.value = null;
});

function onMove(e: PointerEvent) {
  if (!props.myTurn || anim) return;
  const p = toTable(e);
  const cb = cuePos.value ?? cue();
  aim.value = Math.atan2(p.y - cb.y, p.x - cb.x);
}
function onDown(e: PointerEvent) {
  if (!props.myTurn || anim) return;
  const p = toTable(e);
  // Ball in hand: first tap places the cue ball behind the head line.
  if (st.value.ballInHand && !cuePos.value && p.x <= POOL.W / 4) return void (cuePos.value = { x: Math.max(POOL.R, p.x), y: Math.min(POOL.H - POOL.R, Math.max(POOL.R, p.y)) });
  onMove(e);
  charging.value = true;
  power.value = 0.05;
}
function onUp() {
  if (!charging.value) return;
  charging.value = false;
  emit('move', { type: 'shoot', angle: aim.value, power: power.value, ...(cuePos.value ? { cueX: cuePos.value.x, cueY: cuePos.value.y } : {}) });
  power.value = 0;
}
function resize() {
  const c = canvas.value!;
  c.width = c.clientWidth * devicePixelRatio;
  c.height = c.width * ((POOL.H + PAD * 2) / (POOL.W + PAD * 2));
}
onMounted(() => {
  shown = st.value.balls.map((b) => ({ ...b }));
  resize();
  addEventListener('resize', resize);
  raf = requestAnimationFrame(loop);
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  removeEventListener('resize', resize);
});
const myGroup = computed(() => (props.arena.mySeat != null ? st.value.groups[props.arena.mySeat] : null));
</script>

<template>
  <div class="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
    <section class="card p-3">
      <canvas ref="canvas" class="w-full rounded-[22px] touch-none" :class="myTurn ? 'cursor-crosshair' : ''" @pointermove="onMove" @pointerdown="onDown" @pointerup="onUp" @pointerleave="onUp" />
      <p class="text-center text-body-sm text-on-surface-variant mt-2">
        <template v-if="myTurn">{{ st.ballInHand && !cuePos ? 'Ball in hand: tap left of the line to place the cue ball' : 'Aim with the pointer · press and hold for power · release to shoot' }}</template>
        <template v-else>Waiting for the other player…</template>
        <template v-if="myGroup"> · You’re on <b>{{ myGroup }}</b></template>
      </p>
    </section>
    <div class="space-y-3">
      <PlayerStrip :arena="arena" :extra="(s) => st.groups[s] ?? 'open table'" />
      <ul class="card p-3 text-body-sm text-on-surface-variant space-y-1"><li v-for="(l, i) in [...st.log].reverse()" :key="i">{{ l }}</li></ul>
    </div>
  </div>
</template>

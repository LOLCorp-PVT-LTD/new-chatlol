import { ARCADE, brickRect } from '@chatlol/shared';

/**
 * Canvas renderers for the newer arcade games. Each draws the shared engine state into a W×H canvas (device
 * pixels); `ui` carries client-only presentation state (Echo's playback clock, the last tapped pad).
 */
export type ArcadeUi = { echoT0: number; echoRound: number; tap: { i: number; t: number } | null };
type Ctx = CanvasRenderingContext2D;
type Draw = (x: Ctx, st: any, W: number, H: number, now: number, ui: ArcadeUi) => void;

const rr = (x: Ctx, a: number, b: number, w: number, h: number, r: number) => (x.beginPath(), x.roundRect(a, b, w, h, r), x.fill());
const bgGrad = (x: Ctx, W: number, H: number, a: string, b: string) => {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
};
const text = (x: Ctx, t: string, cx: number, cy: number, size: number, color = '#fff', weight = 700) => {
  x.fillStyle = color;
  x.font = `${weight} ${size}px Manrope, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(t, cx, cy);
};

/** Echo: how long each pad lights during playback (faster every level). */
export const echoStep = (st: any) => ARCADE.echo.stepMs!(st);
export const echoPlaying = (st: any, ui: ArcadeUi, now: number) => !st.dead && ui.echoRound === st.round && now - ui.echoT0 < st.round * echoStep(st) + 300;
/** [cols, rows] for grid games, by level. */
export const gridOf = (key: string, st: any): [number, number] => {
  const g = ARCADE[key as keyof typeof ARCADE];
  return g.grid ? g.grid(st) : [g.cols ?? 1, g.rows ?? 1];
};

const breakout: Draw = (x, st, W) => {
  const C = ARCADE.breakout.C!;
  const k = W / C.W;
  x.scale(k, k);
  bgGrad(x, C.W, C.H, '#1b1036', '#3b0f3a');
  const ROW = ['#ff4d6d', '#ff7a3d', '#ffb347', '#ffd166', '#7bd389', '#5ec2ff'];
  st.bricks.forEach((b: number, i: number) => {
    if (!b) return;
    const r = brickRect(i);
    // Tough bricks: silver (2 hits left) and steel (3), with cracks as they wear down.
    x.fillStyle = b >= 3 ? '#8a94a6' : b === 2 ? '#cfd6e2' : ROW[r.row % ROW.length];
    rr(x, r.x, r.y, r.w, r.h, 4);
    x.fillStyle = 'rgba(255,255,255,.25)';
    x.fillRect(r.x + 3, r.y + 2, r.w - 6, 3);
    if (b >= 2) text(x, '◆'.repeat(b - 1), r.x + r.w / 2, r.y + r.h / 2 + 1, 9, 'rgba(30,30,50,.6)', 800);
  });
  x.fillStyle = '#fff';
  x.shadowColor = '#ff9a4d';
  x.shadowBlur = 14;
  rr(x, st.x - st.pw / 2, C.PY, st.pw, 10, 5);
  if (st.ball) {
    x.beginPath();
    x.arc(st.ball.x, st.ball.y, C.R, 0, Math.PI * 2);
    x.fill();
  }
  x.shadowBlur = 0;
  text(x, '❤'.repeat(Math.max(0, st.lives)), 30, 24, 16, '#ff6b81');
  text(x, `Level ${st.level}`, C.W - 44, 24, 13, 'rgba(255,255,255,.75)', 600);
};

const meteor: Draw = (x, st, W, _H, now) => {
  const C = ARCADE.meteor.C!;
  const k = W / C.W;
  x.scale(k, k);
  bgGrad(x, C.W, C.H, '#05071a', '#2a0c3d');
  for (let i = 0; i < 40; i++) {
    const sx = (i * 97) % C.W;
    const sy = ((i * 53 + st.ticks * (0.4 + (i % 3) * 0.3)) % C.H);
    x.fillStyle = `rgba(255,255,255,${0.25 + (i % 4) * 0.15})`;
    x.fillRect(sx, sy, 2, 2);
  }
  for (const r of st.rocks) {
    x.save();
    x.translate(r.x, r.y);
    x.rotate(r.spin + now / 600);
    const g = x.createRadialGradient(-r.rad / 3, -r.rad / 3, 2, 0, 0, r.rad);
    g.addColorStop(0, '#c9a27e');
    g.addColorStop(1, '#5b3a29');
    x.fillStyle = g;
    x.beginPath();
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2;
      const rad = r.rad * (0.82 + ((a * 37) % 10) / 50);
      a ? x.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad) : x.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    x.closePath();
    x.fill();
    x.restore();
  }
  x.font = '30px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('🚀', st.x, C.SY);
  x.fillStyle = 'rgba(255,140,60,.55)';
  x.beginPath();
  x.ellipse(st.x, C.SY + 22, 5, 8 + Math.sin(now / 50) * 3, 0, 0, Math.PI * 2);
  x.fill();
};

const runner: Draw = (x, st, W) => {
  const C = ARCADE.runner.C!;
  const k = W / C.W;
  x.scale(k, k);
  bgGrad(x, C.W, C.H, '#ff9a6b', '#ffcf8a');
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.arc(470, 90, 38, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(120,60,90,.25)';
  for (let i = 0; i < 6; i++) {
    const hx = ((i * 140 - st.dist * 0.2) % 840 + 840) % 840 - 120;
    x.beginPath();
    x.moveTo(hx, C.GY);
    x.lineTo(hx + 70, C.GY - 60 - (i % 3) * 18);
    x.lineTo(hx + 140, C.GY);
    x.fill();
  }
  x.fillStyle = '#7a4b2a';
  x.fillRect(0, C.GY, C.W, C.H - C.GY);
  x.fillStyle = 'rgba(0,0,0,.15)';
  for (let i = 0; i < 20; i++) x.fillRect(((i * 47 - st.dist) % C.W + C.W) % C.W, C.GY + 10 + (i % 3) * 12, 14, 3);
  for (const o of st.obs) {
    if (o.fly) {
      x.font = '26px serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.save();
      x.translate(o.x + o.w / 2, C.GY - o.fly - o.h / 2);
      x.scale(-1, 1);
      x.fillText(Math.floor(st.ticks / 10) % 2 ? '🦅' : '🐦', 0, 0);
      x.restore();
      continue;
    }
    x.fillStyle = '#2f8f4e';
    rr(x, o.x, C.GY - o.h, o.w, o.h, 6);
    x.fillStyle = '#3fb064';
    rr(x, o.x + 3, C.GY - o.h + 4, 4, o.h - 8, 2);
  }
  x.font = '34px serif';
  x.textAlign = 'center';
  x.textBaseline = 'bottom';
  x.save();
  x.translate(C.X + C.PW / 2, C.GY - st.y + 2);
  x.scale(-1, 1);
  x.fillText('🏃', 0, 0);
  x.restore();
};

const whack: Draw = (x, st, W, H, now) => {
  bgGrad(x, W, H, '#6bbf59', '#3f8f3a');
  const cell = W / 3;
  for (let i = 0; i < 9; i++) {
    const cx = (i % 3) * cell + cell / 2;
    const cy = Math.floor(i / 3) * cell + cell / 2 + cell * 0.12;
    x.fillStyle = '#3b2416';
    x.beginPath();
    x.ellipse(cx, cy + cell * 0.18, cell * 0.36, cell * 0.13, 0, 0, Math.PI * 2);
    x.fill();
    const u = st.up[i];
    if (u) {
      const t = 1 - u.left / u.life;
      const rise = Math.min(1, Math.min(t, 1 - t) * 6);
      x.save();
      x.beginPath();
      x.rect(cx - cell / 2, cy - cell, cell, cell + cell * 0.18);
      x.clip();
      x.font = `${cell * 0.5}px serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      if (u.gold) (x.shadowColor = '#ffd700'), (x.shadowBlur = 24);
      x.fillText(u.bomb ? '💣' : u.gold ? '🌟' : '✨', cx, cy + cell * 0.35 - rise * cell * 0.45);
      x.restore();
    }
    if (st.flash[i] > 0) text(x, '+', cx, cy - cell * 0.3, cell * 0.3, '#fff59d', 800);
    if (st.flash[i] < 0) text(x, '−', cx, cy - cell * 0.3, cell * 0.3, '#ff6b6b', 800);
  }
  // Time left this level (top) and hits towards the target (bottom).
  const LT = ARCADE.whack.C!.LEVEL_TICKS;
  const left = Math.max(0, 1 - st.clock / LT);
  const goal = ARCADE.whack.goal!(st);
  x.fillStyle = 'rgba(0,0,0,.25)';
  rr(x, W * 0.04, W * 0.03, W * 0.92, W * 0.025, W * 0.0125);
  rr(x, W * 0.04, H - W * 0.055, W * 0.92, W * 0.025, W * 0.0125);
  x.fillStyle = left < 0.25 ? '#ff6b6b' : '#fff59d';
  rr(x, W * 0.04, W * 0.03, W * 0.92 * left, W * 0.025, W * 0.0125);
  x.fillStyle = st.levelHits >= goal ? '#7CFC9A' : '#ffffff';
  rr(x, W * 0.04, H - W * 0.055, W * 0.92 * Math.min(1, st.levelHits / goal), W * 0.025, W * 0.0125);
  text(x, `${st.levelHits}/${goal} hits`, W / 2, H - W * 0.09, W * 0.035, '#fff', 700);
  void now;
};

const memory: Draw = (x, st, W, H) => {
  bgGrad(x, W, H, '#2b1a4a', '#4b1f5a');
  const [cols, rows] = gridOf('memory', st);
  const cw = W / cols;
  const ch = H / rows;
  const cell = Math.min(cw, ch);
  const faces = ARCADE.memory.faces!;
  st.cards.forEach((f: number, i: number) => {
    const cx = (i % cols) * cw + (cw - cell) / 2;
    const cy = Math.floor(i / cols) * ch + (ch - cell) / 2;
    const up = st.matched[i] || st.open.includes(i);
    x.fillStyle = st.matched[i] ? 'rgba(255,255,255,.18)' : up ? '#fff5ec' : '#ff7a3d';
    rr(x, cx + cell * 0.06, cy + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.14);
    if (up) {
      x.globalAlpha = st.matched[i] ? 0.55 : 1;
      x.font = `${cell * 0.48}px serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(faces[f], cx + cell / 2, cy + cell / 2 + 2);
      x.globalAlpha = 1;
    } else text(x, '?', cx + cell / 2, cy + cell / 2, cell * 0.36, 'rgba(255,255,255,.85)', 800);
  });
  // Misses left this board.
  const left = Math.max(0, st.allowed - st.misses);
  text(x, `${left} miss${left === 1 ? '' : 'es'} left`, W / 2, H - 12, Math.max(11, W * 0.026), left <= 2 ? '#ff8a8a' : 'rgba(255,255,255,.75)', 700);
};

const mines: Draw = (x, st, W) => {
  const n = st.n;
  const cell = W / n;
  const NUM = ['', '#1e88e5', '#43a047', '#e53935', '#5e35b1', '#8d6e63', '#00897b', '#000', '#777'];
  x.fillStyle = '#d9c7b4';
  x.fillRect(0, 0, W, W);
  for (let i = 0; i < n * n; i++) {
    const cx = (i % n) * cell;
    const cy = Math.floor(i / n) * cell;
    const boom = st.boom === i;
    if (st.open[i]) {
      x.fillStyle = '#f5ebe0';
      rr(x, cx + 1.5, cy + 1.5, cell - 3, cell - 3, 4);
      if (st.count[i]) text(x, String(st.count[i]), cx + cell / 2, cy + cell / 2 + 1, cell * 0.5, NUM[st.count[i]], 800);
    } else {
      x.fillStyle = boom ? '#ff5252' : (i + Math.floor(i / n)) % 2 ? '#ff9a4d' : '#ff8a3d';
      rr(x, cx + 1.5, cy + 1.5, cell - 3, cell - 3, 4);
      const showMine = st.dead && !st.won && st.mine?.[i];
      if (st.flag[i] || showMine) {
        x.font = `${cell * 0.55}px serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(showMine ? '💣' : '🚩', cx + cell / 2, cy + cell / 2 + 1);
      }
    }
  }
};

const ECHO_COLORS = [['#ff5e5e', '#ffb3b3'], ['#4fc3f7', '#b3e5fc'], ['#ffd54f', '#fff3c4'], ['#81c784', '#d7f5d8'], ['#ba68c8', '#ecc6f2'], ['#ff8a3d', '#ffd2b0'], ['#4db6ac', '#c4f0eb'], ['#f06292', '#ffc7da'], ['#9575cd', '#d9ccf5']];
const echo: Draw = (x, st, W, H, now, ui) => {
  bgGrad(x, W, H, '#1a1033', '#2d1450');
  const playing = echoPlaying(st, ui, now);
  const stepMs = echoStep(st);
  let lit = -1;
  if (playing) {
    const k = Math.floor((now - ui.echoT0 - 300) / stepMs);
    const into = (now - ui.echoT0 - 300) % stepMs;
    if (k >= 0 && k < st.round && into < stepMs * 0.7) lit = st.seq[k];
  } else if (ui.tap && now - ui.tap.t < 220) lit = ui.tap.i;
  if (st.dead && st.wrong >= 0) lit = st.wrong;
  const [cols, rows] = gridOf('echo', st);
  const cw = W / cols;
  const ch = H / rows;
  for (let i = 0; i < cols * rows; i++) {
    const cx = (i % cols) * cw;
    const cy = Math.floor(i / cols) * ch;
    const on = lit === i;
    const [base, glow] = ECHO_COLORS[i % ECHO_COLORS.length];
    x.fillStyle = on ? glow : base;
    if (on) (x.shadowColor = glow), (x.shadowBlur = 40);
    x.globalAlpha = on ? 1 : 0.75;
    rr(x, cx + 10, cy + 10, cw - 20, ch - 20, 24);
    x.shadowBlur = 0;
    x.globalAlpha = 1;
  }
  x.fillStyle = 'rgba(20,10,40,.85)';
  x.beginPath();
  x.arc(W / 2, H / 2, W * 0.11, 0, Math.PI * 2);
  x.fill();
  text(x, playing ? '👀' : String(st.round), W / 2, H / 2 + 2, W * 0.07);
};

const slide: Draw = (x, st, W) => {
  x.fillStyle = '#e7d8c9';
  rr(x, 0, 0, W, W, 18);
  const n = st.n;
  const cell = W / n;
  st.tiles.forEach((v: number, i: number) => {
    if (!v) return;
    const cx = (i % n) * cell;
    const cy = Math.floor(i / n) * cell;
    const home = v - 1 === i;
    x.fillStyle = home ? '#ff9a4d' : '#fff5ec';
    rr(x, cx + cell * 0.05, cy + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.12);
    text(x, String(v), cx + cell / 2, cy + cell / 2 + 2, cell * 0.38, home ? '#fff' : '#5b4137', 700);
  });
};

export const ARCADE_DRAW: Record<string, Draw> = { breakout, meteor, runner, whack, memory, mines, echo, slide };

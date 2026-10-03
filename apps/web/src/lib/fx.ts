/** Little bits of juice: haptics, sounds, confetti. All respect user settings + reduced motion. */
let ctx: AudioContext | null = null;
export const fxPrefs = { sound: true, haptics: true, motion: true };

export function buzz(pattern: number | number[] = 12) {
  if (fxPrefs.haptics && 'vibrate' in navigator) navigator.vibrate?.(pattern);
}

export function ding(kind: 'reward' | 'match' | 'level' | 'tap' | 'message' | 'notify' | 'request' = 'reward') {
  if (!fxPrefs.sound) return;
  try {
    ctx ??= new AudioContext();
    // message: a soft two-note "pop" for DMs · notify: a bell for notifications · request: a rising three-note call
    const notes = { reward: [880, 1320], match: [660, 990, 1320], level: [523, 659, 784, 1046], tap: [440], message: [988, 1319], notify: [784, 1175], request: [587, 784, 1175] }[kind];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t = ctx!.currentTime + i * 0.08;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch { /* autoplay blocked */ }
}

export function confetti(originX = window.innerWidth / 2, originY = window.innerHeight / 2, count = 36) {
  if (!fxPrefs.motion) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Confetti in the person's theme colours (plus gold).
  const css = getComputedStyle(document.documentElement);
  const themed = (n: string) => `rgb(${css.getPropertyValue(`--c-${n}`).trim().replace(/ /g, ',')})`;
  const colors = [themed('tangerine'), themed('flame'), themed('coral'), '#ffd700', themed('secondary-container')];
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 180;
    p.style.cssText = `position:absolute;left:${originX}px;top:${originY}px;width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px;
      background:${colors[i % colors.length]};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};`;
    layer.appendChild(p);
    p.animate(
      [{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
       { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 120}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
      { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), 1700);
}

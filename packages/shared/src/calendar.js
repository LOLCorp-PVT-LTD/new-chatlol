// ——— Calendar helpers shared by the web and native date pickers ———
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (n) => String(n).padStart(2, '0');
export const toIsoDate = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** 6×7 grid (Monday first) for a month; cells outside the month have `inMonth: false`. */
export function monthGrid(y, m) {
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(Date.UTC(y, m, 1 - first + i));
    cells.push({
      y: date.getUTCFullYear(),
      m: date.getUTCMonth(),
      d: date.getUTCDate(),
      inMonth: date.getUTCMonth() === m,
      iso: date.toISOString().slice(0, 10),
    });
  }
  return cells;
}

/** "14 May 2001" */
export function formatDate(iso) {
  const p = parseIsoDate(iso);
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : '';
}

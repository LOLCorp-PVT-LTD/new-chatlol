// Usage: NVIDIA_API_KEY=nvapi-... node scripts/nim-probe.mjs [model-id ...]
// Calls every chat-looking model in NVIDIA's catalogue (or the ids you pass) and prints the real HTTP status for each.
const BASE = process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
const KEY = process.env.NVIDIA_API_KEY ?? (process.env.NVIDIA_API_KEYS ?? '').split(',')[0].trim();
if (!KEY) throw new Error('Set NVIDIA_API_KEY');
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
let ids = process.argv.slice(2);
if (!ids.length) {
  const j = await fetch(`${BASE}/models`, { headers: H }).then((r) => r.json());
  ids = j.data.map((m) => m.id).filter((m) => !/embed|rerank|guard|safety|reward|parse|retriev|clip|vila|paligemma|diffusion|flux|stable/i.test(m)).sort();
}
console.log(`${ids.length} models`);
let ok = 0;
for (const model of ids) {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST', headers: H, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ model, messages: [{ role: 'system', content: 'You are Mia, 24, a film photographer in Seattle. Text like a real person: warm, casual, lowercase, one or two short sentences. Never explain your reasoning.' }, { role: 'user', content: 'hey whats up' }], max_tokens: 200 }),
    });
    const text = await res.text();
    let note = text.replace(/\s+/g, ' ').slice(0, 90);
    if (res.ok) {
      const m = JSON.parse(text).choices?.[0]?.message ?? {};
      note = m.content ? `"${m.content.trim().slice(0, 30)}"` : m.reasoning_content || m.reasoning ? 'REASONING ONLY (no content)' : 'EMPTY';
      if (m.content && /^\s*(the user|user is|okay,? so|i need to|let me|first,)|i need to respond as|my texting style/i.test(m.content)) note = `LEAKS REASONING: ${m.content.slice(0, 50)}`;
      else if (m.content) ok++;
    }
    console.log(`${res.ok && !note.startsWith('REASONING') && !note.startsWith('LEAKS') && note !== 'EMPTY' ? 'OK  ' : 'FAIL'} ${String(res.status).padEnd(4)} ${String(Date.now() - t).padStart(5)}ms  ${model}  ${res.ok ? note : ''}${res.ok ? '' : note}`);
  } catch (e) {
    console.log(`FAIL ERR  ${model}  ${e.message}`);
  }
}
console.log(`\n${ok}/${ids.length} usable`);

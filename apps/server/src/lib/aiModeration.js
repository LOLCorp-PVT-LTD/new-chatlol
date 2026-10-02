import { config } from '../config.js';
import { db, now } from '../db.js';
import { classify } from './moderation.js';
import { addStrike, flag } from './enforcement.js';
import { shared } from './shared.js';
import { io, room } from './io.js';

/**
 * SafeShield AI moderation. Every piece of user content is screened after it's written:
 *  - unsafe content is removed and the author gets a strike (strikes escalate: warn → mute → suspend → review for ban)
 *  - threats / criminal activity / exploitation: removed, 30-day suspension, flagged for a human to terminate
 *  - name-calling that isn't bannable on its own is counted; keeping it up (or aiming it at one person) earns strikes
 * Reports are reviewed by the same pipeline (plus an LLM judge over the conversation when NVIDIA NIM is configured),
 * and anything the AI isn't sure about goes to the admin queue.
 */

/** Removes a piece of content from view. `ref` = { type, id }. */
export async function removeContent(ref, reason = 'Removed by SafeShield') {
  if (!ref?.id) return;
  const hide = { $set: { hidden: true, removedReason: reason, removedAt: now() } };
  switch (ref.type) {
    case 'post':
      await db.posts.updateOne({ _id: ref.id }, hide);
      break;
    case 'comment': {
      const c = await db.comments.findOneAndUpdate({ _id: ref.id, hidden: { $ne: true } }, hide);
      if (c) await db.posts.updateOne({ _id: c.postId }, { $inc: { commentCount: -1 } });
      break;
    }
    case 'shout':
      await db.shouts.updateOne({ _id: ref.id }, hide);
      break;
    case 'thread':
      await db.threads.updateOne({ _id: ref.id }, hide);
      break;
    case 'reply':
      await db.replies.updateOne({ _id: ref.id }, hide);
      break;
    case 'wall':
      await db.wallNotes.updateOne({ _id: ref.id }, hide);
      break;
    case 'message':
      await db.messages.updateOne(
        { _id: ref.id },
        { $set: { body: '🛡️ Message removed by SafeShield', mediaUrl: null, kind: 'removed', removedReason: reason } },
      );
      break;
    default:
      return;
  }
  io()?.to(room.global).emit('content:removed', { type: ref.type, id: ref.id });
}

/** Text of a reported/flagged item, for review. */
async function contentOf(type, id) {
  const pick = {
    post: ['posts', 'body', 'authorId'],
    comment: ['comments', 'body', 'authorId'],
    shout: ['shouts', 'body', 'authorId'],
    thread: ['threads', 'body', 'authorId'],
    reply: ['replies', 'body', 'authorId'],
    wall: ['wallNotes', 'body', 'authorId'],
    message: ['messages', 'body', 'authorId'],
  }[type];
  if (!pick) return null;
  const d = await db[pick[0]].findOne({ _id: id });
  return d ? { text: `${type === 'thread' ? `${d.title}\n` : ''}${d[pick[1]] ?? ''}`, authorId: d[pick[2]], doc: d } : null;
}

/**
 * Screens new content in the background. `targetId` = the person it's aimed at (DM recipient, wall owner, mentioned user).
 * Never throws — moderation must not break posting.
 */
export function screen({ userId, text, ref, targetId = null }) {
  if (!text?.trim()) return;
  void (async () => {
    const verdict = await classify(text);
    if (verdict.severe) {
      await removeContent(ref);
      await addStrike(userId, {
        reason: `Threats or criminal activity (${verdict.categories.join(', ')})`,
        category: 'severe',
        ref,
        severe: true,
      });
      return;
    }
    if (!verdict.safe) {
      await removeContent(ref);
      await addStrike(userId, {
        reason: `Removed for ${verdict.categories.join(', ') || 'unsafe content'}`,
        category: verdict.categories[0] ?? 'unsafe',
        ref,
      });
      return;
    }
    if (verdict.hostile) await countHostility(userId, targetId, ref, text);
  })().catch((e) => console.warn('[safeshield]', e.message));
}

/** Insults add up: 3 in an hour, or 2 aimed at the same person in a day, become a harassment strike. */
async function countHostility(userId, targetId, ref, text) {
  const hour = await shared().incr(`hostile:${userId}`, 3600);
  const pair = targetId ? await shared().incr(`hostile:${userId}:${targetId}`, 86_400) : 0;
  if (hour === 3 || pair === 2) {
    await removeContent(ref);
    await addStrike(userId, {
      reason: pair >= 2 ? 'Repeatedly insulting the same person' : 'Repeated insults and hostility',
      category: 'harassment',
      ref,
    });
  } else if (hour > 3 || pair > 2) {
    await removeContent(ref);
    await flag({ userId, reason: 'Continued hostility after a strike', category: 'harassment', ref, excerpt: text.slice(0, 280) });
  }
}

/**
 * Asks a NIM chat model to judge a conversation for harassment, threats, grooming, scams or criminal planning.
 * Returns { violation, severity: none|minor|major|severe, offenderId, reason } or null when no model is configured.
 */
async function judgeConversation(messages, users) {
  if (!config.nim.apiKey) return null;
  const { nimChat } = await import('../ai/nim.js');
  const names = new Map(users.map((u) => [u._id, `@${u.handle}`]));
  const transcript = messages.map((m) => `${names.get(m.authorId) ?? m.authorId}: ${m.body}`).join('\n');
  const out = await nimChat(
    [
      {
        role: 'system',
        content:
          'You are a trust & safety reviewer for a social app for adults. Judge whether anyone in this chat is harassing, bullying, threatening, sexually harassing, scamming, grooming, or planning crime. Banter between friends and mild swearing are fine. Reply with ONLY JSON: {"violation":true|false,"severity":"none|minor|major|severe","offender":"@handle or empty","reason":"short reason"}',
      },
      { role: 'user', content: transcript.slice(-6000) },
    ],
    { model: config.nim.chatModel, maxTokens: 120, temperature: 0, retries: 1 },
  );
  try {
    const j = JSON.parse(out?.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
    if (!j) return null;
    const offender = users.find((u) => `@${u.handle}`.toLowerCase() === String(j.offender ?? '').toLowerCase());
    return {
      violation: !!j.violation,
      severity: j.severity ?? 'none',
      offenderId: offender?._id ?? null,
      reason: String(j.reason ?? '').slice(0, 200),
    };
  } catch {
    return null;
  }
}

/** Reviews a fresh report. Clear violations are actioned automatically; the rest wait in the admin queue. */
export async function reviewReport(report) {
  try {
    let decided = false;
    const item = await contentOf(report.targetType, report.targetId);
    if (item) {
      const v = await classify(item.text);
      if (v.severe || !v.safe) {
        const ref = { type: report.targetType, id: report.targetId };
        await removeContent(ref, 'Removed after a report');
        await addStrike(item.authorId, {
          reason: `Reported content: ${v.categories.join(', ') || 'unsafe'}`,
          category: v.categories[0] ?? 'reported',
          ref,
          severe: v.severe,
        });
        decided = true;
      }
    }
    // Reports about a person or a DM: read the conversation between reporter and reported.
    const otherId = report.targetType === 'user' ? report.targetId : report.targetType === 'message' ? item?.authorId : null;
    if (!decided && otherId) {
      const pairKey = [report.reporterId, otherId].sort().join('|');
      const conv = await db.conversations.findOne({ pairKey });
      if (conv) {
        const msgs = (await db.messages.find({ roomType: 'dm', roomId: conv._id }).sort({ createdAt: -1 }).limit(40).toArray()).reverse();
        const users = await db.users.find({ _id: { $in: [report.reporterId, otherId] } }, { projection: { handle: 1 } }).toArray();
        const j = await judgeConversation(msgs, users);
        if (j?.violation && j.offenderId === otherId && j.severity !== 'none' && j.severity !== 'minor') {
          await addStrike(otherId, {
            reason: `Harassment in DMs: ${j.reason}`,
            category: 'harassment',
            ref: { type: 'conversation', id: conv._id },
            severe: j.severity === 'severe',
          });
          decided = true;
        } else if (!j) {
          // No model: screen the reported person's recent messages with the rules instead.
          for (const m of msgs.filter((x) => x.authorId === otherId).slice(-15)) {
            const v = await classify(m.body ?? '');
            if (!v.safe || v.severe) {
              await removeContent({ type: 'message', id: m._id }, 'Removed after a report');
              await addStrike(otherId, {
                reason: `Reported DMs: ${v.categories.join(', ')}`,
                category: 'harassment',
                ref: { type: 'message', id: m._id },
                severe: v.severe,
              });
              decided = true;
              break;
            }
          }
        }
      }
    }
    await db.reports.updateOne(
      { _id: report._id },
      { $set: decided ? { status: 'actioned', resolvedBy: 'ai', resolvedAt: now() } : { status: 'open' } },
    );
  } catch (e) {
    console.warn('[safeshield] report review failed', e.message);
  }
}

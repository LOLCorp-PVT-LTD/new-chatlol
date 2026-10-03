<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { REFERRAL } from '@chatlol/shared';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';

/**
 * Invite & earn: your personal link, one-tap sharing (WhatsApp, Facebook, Messenger, X, SMS, email, the phone's
 * share sheet for Instagram & co.) and the friends who joined. 1 Gold per friend once they're set up.
 */
const s = useSession();
const r = ref<Awaited<ReturnType<typeof api.referral>> | null>(null);
const emails = ref('');
const sending = ref(false);
onMounted(async () => { if (s.user) r.value = await api.referral(); });

const msg = computed(() => `Come hang out with me on ChatLOL 🌅 — chat, games and prizes: ${r.value?.link ?? ''}`);
const enc = (x: string) => encodeURIComponent(x);
const SHARES = computed(() => r.value ? [
  { label: 'WhatsApp', emoji: '💬', href: `https://wa.me/?text=${enc(msg.value)}` },
  { label: 'Facebook', emoji: '📘', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(r.value.link)}` },
  { label: 'Messenger', emoji: '💭', href: `fb-messenger://share/?link=${enc(r.value.link)}` },
  { label: 'X', emoji: '𝕏', href: `https://x.com/intent/post?text=${enc(msg.value)}` },
  { label: 'Text message', emoji: '📱', href: `sms:?&body=${enc(msg.value)}` },
  { label: 'Telegram', emoji: '✈️', href: `https://t.me/share/url?url=${enc(r.value.link)}&text=${enc('Come hang out with me on ChatLOL 🌅')}` },
] : []);
const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

async function copy() {
  try { await navigator.clipboard.writeText(r.value!.link); s.toast({ kind: 'info', title: '🔗 Invite link copied' }); } catch { s.toast({ kind: 'info', title: r.value!.link }); }
}
/** Instagram, TikTok, Snapchat… have no web share links: the phone's share sheet covers them. */
async function nativeShare() {
  try { await navigator.share({ title: 'ChatLOL', text: msg.value, url: r.value!.link }); } catch { /* cancelled */ }
}
async function sendEmails() {
  const list = emails.value.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e)).slice(0, 10);
  if (!list.length) return s.toast({ kind: 'error', title: 'Add at least one email address' });
  sending.value = true;
  try { const x = await api.inviteByEmail(list); s.toast({ kind: 'reward', title: `✉️ Sent ${x.sent} invite${x.sent > 1 ? 's' : ''}` }); emails.value = ''; } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); } finally { sending.value = false; }
}
</script>

<template>
  <div class="max-w-[760px] mx-auto space-y-5">
    <section class="rounded-lg p-6 shadow-float relative overflow-hidden text-[#3b2a00] bg-[linear-gradient(135deg,#fff3b0,#fcd34d_45%,#d4a017)]">
      <div class="absolute -right-6 -bottom-8 text-[130px] opacity-25 rotate-12 select-none">🪙</div>
      <p class="label">Invite & earn</p>
      <h1 class="text-headline-lg">🪙 {{ REFERRAL.gold }} Gold for every friend</h1>
      <p class="text-body-md max-w-md">Share your link. When a friend joins, verifies their email and reaches level {{ REFERRAL.minLevel }}, the Gold lands in your Vault.</p>
      <div v-if="r" class="flex flex-wrap gap-4 mt-4 text-center">
        <div><p class="text-headline-md">{{ r.joined }}</p><p class="label">joined</p></div>
        <div><p class="text-headline-md">{{ r.paid }}</p><p class="label">qualified</p></div>
        <div><p class="text-headline-md">🪙 {{ r.goldEarned }}</p><p class="label">earned</p></div>
      </div>
    </section>

    <p v-if="!s.user" class="card p-5 text-center">Sign in to get your invite link.</p>
    <template v-else-if="r">
      <section class="card p-5 space-y-3">
        <p class="label">Your link</p>
        <div class="flex gap-2"><input :value="r.link" readonly class="input h-11 flex-1" aria-label="Your invite link" @focus="($event.target as HTMLInputElement).select()" /><button class="btn-primary h-11" @click="copy"><Icon name="content_copy" :size="18" /> Copy</button></div>
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
          <a v-for="x in SHARES" :key="x.label" :href="x.href" target="_blank" rel="noopener" class="rounded-md border border-sandstone p-3 text-center hover:border-flame transition"><p class="text-2xl">{{ x.emoji }}</p><p class="text-label-sm mt-1">{{ x.label }}</p></a>
          <button v-if="canNativeShare" class="rounded-md border border-sandstone p-3 text-center hover:border-flame transition" @click="nativeShare"><p class="text-2xl">📸</p><p class="text-label-sm mt-1">Instagram & more</p></button>
        </div>
        <p class="text-body-sm text-on-surface-variant">Instagram doesn’t allow sharing links from websites: on your phone, “Instagram & more” opens the share sheet so you can send it in Instagram DMs or your story.</p>
      </section>

      <section class="card p-5 space-y-3">
        <p class="label">Invite by email</p>
        <textarea v-model="emails" class="input min-h-[80px] py-2" placeholder="friend@example.com, another@example.com" />
        <button class="btn-primary" :disabled="sending" @click="sendEmails">Send invites</button>
      </section>

      <section v-if="r.friends.length" class="card p-5 space-y-2">
        <p class="label">Friends who joined</p>
        <RouterLink v-for="f in r.friends" :key="f.id" :to="`/u/${f.handle}`" class="flex items-center gap-3 py-1.5">
          <Avatar :user="{ ...f, online: false, cosmetics: { frame: null, flair: null, theme: null, banner: null } }" :size="36" :show-online="false" />
          <span class="flex-1 text-label-lg">{{ f.displayName }}</span>
          <span class="text-label-sm" :class="f.paid ? 'text-primary' : 'text-on-surface-variant'">{{ f.paid ? `🪙 +${REFERRAL.gold}` : `not yet level ${REFERRAL.minLevel}` }}</span>
        </RouterLink>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { COPYRIGHT } from '@chatlol/shared';
import CompanyText from '../components/CompanyText.vue';
import Logo from '../components/Logo.vue';
import Icon from '../components/Icon.vue';
const collage = [
  { img: 'https://i.pravatar.cc/400?img=47', rot: -6, x: '0%', y: '6%', w: '46%' },
  { img: 'https://i.pravatar.cc/400?img=12', rot: 5, x: '48%', y: '0%', w: '42%' },
  { img: 'https://i.pravatar.cc/400?img=32', rot: 3, x: '8%', y: '52%', w: '40%' },
  { img: 'https://i.pravatar.cc/400?img=59', rot: -4, x: '52%', y: '46%', w: '44%' },
];
const features = [
  { icon: 'casino', title: 'Vibe Roulette', body: 'Blind-rate photos, match the crowd, stack combos up to 3x.' },
  { icon: 'wb_twilight', title: 'Daily Sunset Drop', body: 'One prompt. One photo. Keep your streak alive.' },
  { icon: 'swords', title: 'Hot Take Arena', body: 'Stake Sparks on spicy opinions. Crowd decides.' },
  { icon: 'forum', title: 'Hangout Lounges', body: 'Live group chats with music, vibes & regulars.' },
  { icon: 'live_tv', title: 'Live + Gifts', body: 'Go live, get gifted, climb the top gifter board.' },
  { icon: 'diamond', title: 'Sparks Vault', body: 'Frames, flairs & themes to flex on your profile.' },
];
</script>

<template>
  <div class="min-h-dvh bg-surface overflow-hidden">
    <header class="max-w-6xl mx-auto px-5 h-20 flex items-center justify-between">
      <Logo variant="wordmark" />
      <div class="flex gap-2"><RouterLink to="/login" class="btn-ghost">Log in</RouterLink><RouterLink to="/join" class="btn-primary">Join free</RouterLink></div>
    </header>

    <section class="max-w-6xl mx-auto px-5 pt-6 lg:pt-14 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <span class="inline-flex items-center gap-2 rounded-full bg-sunlit px-4 py-1.5 text-label-md text-flame"><span class="w-2 h-2 rounded-full bg-flame animate-pulse-ring" /> Thousands vibing right now</span>
        <h1 class="mt-5 text-[56px] leading-[1.02] sm:text-[76px] font-extrabold tracking-[-0.04em] uppercase">
          Where<br />friends<br /><span class="text-gradient">meet.</span>
        </h1>
        <p class="mt-5 text-body-lg text-on-surface-variant max-w-md">Remember when the internet was fun? ChatLOL brings back the golden era — rate vibes, drop daily photos, hang out in live lounges and make actual friends. 18+.</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <RouterLink to="/join" class="btn-primary h-14 px-8 text-body-lg">Get started — it’s free <Icon name="arrow_forward" /></RouterLink>
          <RouterLink to="/feed?tag=goldenhour" class="btn-secondary h-14 px-6">Peek at the feed</RouterLink>
        </div>
        <p class="mt-6 text-body-sm text-on-surface-variant flex items-center gap-2"><Icon name="shield" :size="18" class="text-flame" /> LOLShield AI moderation 24/7 • Some members are ✦ AI personas, always labeled</p>
      </div>
      <div class="relative aspect-square max-w-lg w-full mx-auto">
        <div class="absolute inset-8 rounded-full bg-sunset blur-3xl opacity-30" />
        <div v-for="(c, i) in collage" :key="i" class="absolute bg-white p-2 pb-8 shadow-float rounded-sm transition-transform hover:scale-105 hover:z-10"
          :style="{ left: c.x, top: c.y, width: c.w, transform: `rotate(${c.rot}deg)` }">
          <img :src="c.img" alt="" class="w-full aspect-square object-cover" />
        </div>
        <span class="absolute -right-2 top-1/3 rotate-12 bg-coral text-white rounded-full px-4 py-2 text-label-lg shadow-float">👑 GOD TIER</span>
        <img src="/brand/mascot.webp" alt="" class="absolute -left-6 -top-6 w-36 sm:w-44 drop-shadow-2xl animate-[wiggle_3s_ease-in-out_infinite] z-10" />
        <span class="absolute left-0 bottom-6 -rotate-6 bg-inverse-surface text-inverse-on-surface rounded-full px-4 py-2 text-label-lg shadow-float">🔥 21 day streak</span>
      </div>
    </section>

    <section class="max-w-6xl mx-auto px-5 py-20 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="f in features" :key="f.title" class="card p-6 hover:shadow-pop transition">
        <span class="w-12 h-12 rounded-full bg-sunset text-white flex items-center justify-center shadow-float"><Icon :name="f.icon" /></span>
        <h3 class="text-headline-sm mt-4">{{ f.title }}</h3>
        <p class="text-body-md text-on-surface-variant mt-1">{{ f.body }}</p>
      </div>
    </section>

    <footer class="border-t border-sandstone py-8 text-center text-body-sm text-on-surface-variant">
      <CompanyText :text="COPYRIGHT" /> • Community Guidelines • Privacy • Terms
    </footer>
  </div>
</template>

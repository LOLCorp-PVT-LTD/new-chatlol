<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { LEGAL_DOCS, LEGAL_VERSION } from '@chatlol/shared';
import CompanyText from '../components/CompanyText.vue';

/** Terms, Community Guidelines, Safety Rules and Privacy Notice, from the shared documents. */
const route = useRoute();
const key = computed(() => (route.meta.doc as keyof typeof LEGAL_DOCS) ?? 'terms');
const doc = computed(() => LEGAL_DOCS[key.value]);
const SEV: Record<string, string> = { severe: 'Zero tolerance', high: 'Serious', medium: 'Strikes on repeat', low: 'Warning' };
const TABS = [['terms', 'Terms'], ['guidelines', 'Guidelines'], ['safety', 'Safety'], ['privacy', 'Privacy']] as const;
</script>

<template>
  <article class="max-w-[760px] mx-auto space-y-5 pb-10">
    <nav class="flex gap-2 flex-wrap"><RouterLink v-for="t in TABS" :key="t[0]" :to="`/${t[0]}`" class="chip" :class="{ 'chip-active': key === t[0] }">{{ t[1] }}</RouterLink></nav>
    <header><h1 class="text-headline-xl">{{ doc.title }}</h1><p class="text-body-sm text-on-surface-variant">Version {{ LEGAL_VERSION }}</p></header>
    <p v-if="key === 'guidelines'" class="text-body-lg">ChatLOL should be fun for everyone. These rules apply everywhere — profiles, posts, shouts, chats, lounges, streams and games. LOLShield, our AI moderator, and our team enforce them. Moderators must always give a reason, and you can appeal any decision.</p>
    <section v-for="(s, i) in doc.sections" :key="i" class="card p-5 space-y-2">
      <div class="flex items-start gap-2"><h2 class="text-headline-sm flex-1">{{ s.title }}</h2><span v-if="s.severity" class="chip h-6 text-[10px] shrink-0">{{ SEV[s.severity] }}</span></div>
      <p class="text-body-md leading-relaxed"><CompanyText :text="s.body" /></p>
      <ul v-if="s.examples?.length" class="text-body-sm text-on-surface-variant list-disc pl-5"><li v-for="e in s.examples" :key="e">{{ e }}</li></ul>
    </section>
  </article>
</template>

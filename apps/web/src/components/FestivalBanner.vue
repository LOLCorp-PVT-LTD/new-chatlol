<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import type { HomeData } from '@chatlol/shared';
import FestivalQuiz from './FestivalQuiz.vue';

/** Home banner while a festival is on: greeting, countdown to the big day, and the festival's drop, quiz, lounge and trivia. */
const props = defineProps<{ festival: NonNullable<HomeData['festival']> }>();
const quiz = ref(false);
const nowMs = ref(Date.now());
const t = setInterval(() => (nowMs.value = Date.now()), 60_000);
onUnmounted(() => clearInterval(t));
const daysTo = computed(() => Math.ceil((Date.parse(props.festival.day) - nowMs.value) / 86_400_000));
const when = computed(() => (daysTo.value > 1 ? `${daysTo.value} days to go` : daysTo.value === 1 ? 'Tomorrow!' : daysTo.value === 0 ? 'Today!' : 'Still celebrating'));
</script>

<template>
  <section class="relative overflow-hidden rounded-lg p-6 text-white shadow-float" :style="{ background: festival.gradient }">
    <div class="absolute -right-6 -top-8 text-[150px] opacity-25 rotate-12 select-none pointer-events-none">{{ festival.emoji }}</div>
    <p class="label !text-white/80">{{ festival.emoji }} {{ festival.name }} season · {{ when }}</p>
    <h2 class="text-headline-lg mt-1 drop-shadow">{{ festival.greeting }}</h2>
    <p class="text-body-md opacity-90 max-w-lg mt-1">Themed Daily Drops, a festival quiz with Sparks to win, a seasonal lounge and festival questions in Trivia — all season long.</p>
    <div class="flex flex-wrap gap-2 mt-4">
      <button class="btn bg-white text-[#3b2a00] shadow-float" @click="quiz = true">🧠 Take today’s quiz</button>
      <RouterLink to="/drops" class="btn bg-white/20 text-white">📸 Festival drop</RouterLink>
      <RouterLink v-if="festival.loungeId" :to="`/lounges/${festival.loungeId}`" class="btn bg-white/20 text-white">🛋️ Festival lounge</RouterLink>
      <RouterLink to="/games" class="btn bg-white/20 text-white">🎲 Festival trivia</RouterLink>
    </div>
    <FestivalQuiz v-if="quiz" @close="quiz = false" />
  </section>
</template>

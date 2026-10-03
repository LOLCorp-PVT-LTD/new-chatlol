<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { confetti } from '../lib/fx';
import Modal from './Modal.vue';

/** The daily festival quiz: 5 questions, Sparks for each right answer and a bonus for a perfect round. */
const emit = defineEmits<{ (e: 'close'): void }>();
const s = useSession();
const data = ref<Awaited<ReturnType<typeof api.festival>> | null>(null);
const i = ref(0);
const picks = ref<number[]>([]);
const result = ref<Awaited<ReturnType<typeof api.festivalQuiz>> | null>(null);
const busy = ref(false);
onMounted(async () => (data.value = await api.festival()));
const qs = computed(() => data.value?.quiz?.questions ?? []);
async function choose(c: number) {
  picks.value[i.value] = c;
  if (i.value < qs.value.length - 1) return void (i.value += 1);
  busy.value = true;
  try {
    result.value = await api.festivalQuiz(picks.value);
    if (result.value.reward) s.reward(result.value.reward);
    if (result.value.right === result.value.total) confetti();
  } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); emit('close'); } finally { busy.value = false; }
}
</script>

<template>
  <Modal :title="data?.festival ? `${data.festival.emoji} ${data.festival.name} quiz` : 'Festival quiz'" @close="emit('close')">
    <div class="px-6 pb-6 space-y-4">
      <p v-if="!data" class="text-body-md text-on-surface-variant">Loading…</p>
      <p v-else-if="!data.festival" class="text-body-md">No festival is on right now — check back soon!</p>
      <template v-else-if="data.quiz?.done && !result">
        <p class="text-headline-sm">You’ve done today’s quiz ✅</p>
        <p class="text-body-md text-on-surface-variant">You scored {{ data.quiz.score }}/5. A new quiz unlocks tomorrow.</p>
      </template>
      <template v-else-if="result">
        <p class="text-5xl text-center">{{ result.right === result.total ? '🏆' : result.right >= 3 ? '🎉' : '🙂' }}</p>
        <p class="text-headline-md text-center">{{ result.right }}/{{ result.total }} right</p>
        <p v-if="result.reward" class="text-center text-body-lg">+{{ result.reward.sparks }} ✦</p>
        <ul class="space-y-1.5 text-body-sm">
          <li v-for="(q, k) in qs" :key="k" class="flex gap-2"><span>{{ picks[k] === result.answers[k] ? '✅' : '❌' }}</span><span>{{ q.q }} — <b>{{ q.choices[result.answers[k]] }}</b></span></li>
        </ul>
        <button class="btn-primary w-full" @click="emit('close')">Done</button>
      </template>
      <template v-else-if="qs.length">
        <div class="flex gap-1">
          <span v-for="(q, k) in qs" :key="k" class="h-1.5 flex-1 rounded-full" :class="k < i ? 'bg-flame' : k === i ? 'bg-flame/60' : 'bg-surface-container-high'" />
        </div>
        <p class="label">Question {{ i + 1 }} of {{ qs.length }} · ✦{{ data.quiz?.perRight }} each, +{{ data.quiz?.perfectBonus }} for 5/5</p>
        <p class="text-headline-sm">{{ qs[i].q }}</p>
        <div class="grid gap-2">
          <button v-for="(c, k) in qs[i].choices" :key="k" class="btn-secondary justify-start h-auto py-3 text-left" :disabled="busy" @click="choose(k)">{{ c }}</button>
        </div>
      </template>
    </div>
  </Modal>
</template>

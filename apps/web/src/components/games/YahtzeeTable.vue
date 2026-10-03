<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Arena } from '@chatlol/shared';
import { YAHTZEE_BOXES, yahtzeeScore } from '@chatlol/shared';
import Dice from './Dice.vue';

/** Yahtzee: five tumbling dice (tap to hold), and every player's scorecard with what you'd score in each box. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
type Y = { cards: Record<string, number>[]; turn: number; dice: number[]; rollsLeft: number; round: number; rolls: number; totals: number[] };
const st = computed(() => props.arena.state as unknown as Y);
const hold = ref([false, false, false, false, false]);
watch(() => st.value.turn, () => (hold.value = [false, false, false, false, false]));
const rolledYet = computed(() => st.value.rollsLeft < 3);
function toggle(i: number) {
  if (props.myTurn && rolledYet.value && st.value.rollsLeft > 0) hold.value[i] = !hold.value[i];
}
const roll = () => emit('move', { type: 'roll', hold: hold.value });
const score = (box: string) => emit('move', { type: 'score', box });
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-[28px] p-6 text-white shadow-float bg-[radial-gradient(circle_at_50%_30%,#7c2d12,#3b0a0a)] text-center">
      <p class="text-label-md opacity-80">Round {{ st.round }}/13 · {{ arena.players[st.turn]?.displayName }}’s turn</p>
      <div class="flex justify-center gap-3 my-5">
        <Dice v-for="(d, i) in st.dice" :key="i" :value="rolledYet ? d : null" :roll-key="st.rolls" :size="58" :held="hold[i] && rolledYet" :selectable="myTurn && rolledYet && st.rollsLeft > 0" @toggle="toggle(i)" />
      </div>
      <button v-if="myTurn && st.rollsLeft > 0" class="btn bg-white text-flame h-11" @click="roll">{{ rolledYet ? `Roll again (${st.rollsLeft} left)` : 'Roll the dice' }}</button>
      <p v-else-if="myTurn" class="text-label-lg">Pick a box below ↓</p>
      <p v-if="myTurn && rolledYet && st.rollsLeft > 0" class="text-body-sm opacity-80 mt-2">Tap dice to hold them</p>
    </section>
    <section class="card p-3 overflow-x-auto">
      <table class="w-full text-body-sm">
        <thead><tr><th class="text-left p-2">Box</th><th v-for="p in arena.players" :key="p.id" class="p-2 text-center">{{ p.displayName.split(' ')[0] }}</th></tr></thead>
        <tbody>
          <tr v-for="b in YAHTZEE_BOXES" :key="b.key" class="border-t border-sandstone">
            <td class="p-2">{{ b.label }}</td>
            <td v-for="(c, seat) in st.cards" :key="seat" class="p-1 text-center">
              <span v-if="c[b.key] !== undefined" class="font-semibold">{{ c[b.key] }}</span>
              <button v-else-if="myTurn && seat === arena.mySeat && rolledYet" class="rounded-full px-3 py-1 bg-sunlit text-flame hover:bg-primary-fixed transition" @click="score(b.key)">+{{ yahtzeeScore(b.key, st.dice) }}</button>
              <span v-else class="opacity-30">—</span>
            </td>
          </tr>
          <tr class="border-t-2 border-on-surface/20"><td class="p-2 font-semibold">Total</td><td v-for="(t, seat) in st.totals" :key="seat" class="p-2 text-center text-headline-sm">{{ t }}</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

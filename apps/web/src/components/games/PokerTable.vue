<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Arena, PokerState } from '@chatlol/shared';
import { pokerOptions } from '@chatlol/shared';
import Avatar from '../Avatar.vue';

/** Hold'em table: board, pot, every seat's chips and bet; your hole cards; fold / check / call / raise. */
const props = defineProps<{ arena: Arena; myTurn: boolean }>();
const emit = defineEmits<{ (e: 'move', a: Record<string, unknown>): void }>();
const st = computed(() => props.arena.state as PokerState);
const opts = computed(() => (props.myTurn && props.arena.mySeat != null ? pokerOptions(st.value, props.arena.mySeat) : null));
const raiseTo = ref(0);
watch(opts, (o) => o && (raiseTo.value = o.minRaiseTo), { immediate: true });
const pot = computed(() => st.value.players.reduce((n, p) => n + p.totalIn, 0));
const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const red = (c: string) => c[1] === 'h' || c[1] === 'd';
const label = (c: string) => (c === '??' ? '' : `${c[0] === 'T' ? '10' : c[0]}${SUIT[c[1]]}`);
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-[28px] p-5 sm:p-8 text-white shadow-float bg-[radial-gradient(circle_at_50%_40%,#1f7a4d,#0f4a2d)]">
      <p class="text-center text-label-md opacity-80">Hand {{ st.handNo }}/{{ st.maxHands }} · Blinds {{ st.blinds.sb }}/{{ st.blinds.bb }} · {{ st.street }}</p>
      <div class="flex justify-center gap-2 my-4 min-h-[76px]">
        <span v-for="(c, i) in st.board" :key="i" class="w-12 h-[70px] rounded-md bg-white flex items-center justify-center text-xl font-semibold shadow" :class="red(c) ? 'text-[#c62828]' : 'text-[#1b1b1b]'">{{ label(c) }}</span>
      </div>
      <p class="text-center text-headline-sm">Pot {{ pot.toLocaleString() }}</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
        <div v-for="(p, seat) in st.players" :key="seat" class="rounded-md p-3 bg-black/25" :class="{ 'ring-2 ring-[#fde047]': st.toAct === seat, 'opacity-50': p.folded || p.out }">
          <div class="flex items-center gap-2">
            <Avatar v-if="arena.players[seat]" :user="arena.players[seat]" :size="28" :show-online="false" />
            <p class="text-label-md truncate flex-1">{{ arena.players[seat]?.displayName }}<span v-if="st.dealer === seat"> Ⓓ</span></p>
          </div>
          <p class="text-body-sm mt-1">🪙 {{ p.chips.toLocaleString() }}<span v-if="p.bet"> · bet {{ p.bet }}</span><span v-if="p.allIn"> · ALL IN</span><span v-if="p.folded"> · folded</span></p>
          <div class="flex gap-1 mt-1.5">
            <span v-for="(c, k) in p.hole" :key="k" class="w-8 h-11 rounded bg-white flex items-center justify-center text-sm font-semibold" :class="c === '??' ? '!bg-[repeating-linear-gradient(45deg,#b71c1c,#b71c1c_4px,#e53935_4px,#e53935_8px)]' : red(c) ? 'text-[#c62828]' : 'text-[#1b1b1b]'">{{ label(c) }}</span>
          </div>
        </div>
      </div>
    </section>
    <section v-if="opts" class="card p-4 flex flex-wrap items-center gap-2">
      <button class="btn-secondary h-11" @click="emit('move', { type: 'fold' })">Fold</button>
      <button v-if="opts.canCheck" class="btn-secondary h-11" @click="emit('move', { type: 'check' })">Check</button>
      <button v-else class="btn-primary h-11" @click="emit('move', { type: 'call' })">Call {{ opts.toCall }}</button>
      <template v-if="opts.maxRaiseTo > st.currentBet">
        <input v-model.number="raiseTo" type="range" :min="opts.minRaiseTo" :max="opts.maxRaiseTo" class="flex-1 min-w-[120px]" aria-label="Raise to" />
        <button class="btn-primary h-11" @click="emit('move', { type: 'raise', to: raiseTo })">{{ raiseTo >= opts.maxRaiseTo ? 'All in' : `Raise to ${raiseTo}` }}</button>
      </template>
    </section>
    <section v-if="st.lastHand" class="card p-4 text-body-sm">
      <p class="label mb-1">Last hand</p>
      <p v-for="w in st.lastHand.won" :key="w.seat">🏆 {{ arena.players[w.seat]?.displayName }} won {{ w.amount.toLocaleString() }}<template v-if="st.lastHand.shown[w.seat]"> with {{ st.lastHand.shown[w.seat].hand }} ({{ st.lastHand.shown[w.seat].hole.map(label).join(' ') }})</template></p>
    </section>
  </div>
</template>

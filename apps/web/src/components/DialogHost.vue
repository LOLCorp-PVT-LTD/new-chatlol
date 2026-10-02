<script setup lang="ts">
import { nextTick, reactive, watch } from 'vue';
import { dialogs, type DialogValues } from '../lib/dialog';
import Icon from './Icon.vue';

/** Renders the in-app dialogs opened with formDialog / confirmDialog / promptDialog (lib/dialog.ts). */
const values = reactive<Record<number, DialogValues>>({});
watch(
  dialogs,
  async (list) => {
    for (const d of list)
      if (!values[d.id]) values[d.id] = Object.fromEntries((d.fields ?? []).map((f) => [f.key, f.value ?? (f.type === 'toggle' ? false : '')]));
    await nextTick();
    const top = document.querySelector<HTMLElement>('.dlg:last-of-type [data-autofocus]');
    top?.focus();
  },
  { immediate: true },
);
const top = () => dialogs.value[dialogs.value.length - 1];
function valid(id: number) {
  const d = dialogs.value.find((x) => x.id === id);
  return !(d?.fields ?? []).some((f) => 'required' in f && f.required && !String(values[id]?.[f.key] ?? '').trim());
}
function ok(id: number) {
  const d = dialogs.value.find((x) => x.id === id);
  if (!d || !valid(id)) return;
  const v = values[id] ?? {};
  delete values[id];
  d.resolve(v);
}
function cancel(id: number) {
  const d = dialogs.value.find((x) => x.id === id);
  if (!d) return;
  delete values[id];
  d.resolve(d.hideCancel ? {} : null);
}
function onKey(e: KeyboardEvent, id: number, multiline: boolean) {
  if (e.key === 'Escape') cancel(id);
  else if (e.key === 'Enter' && !multiline && !e.shiftKey && top()?.id === id) { e.preventDefault(); ok(id); }
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="dlg">
      <div v-for="d in dialogs" :key="d.id" class="dlg fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6" role="presentation" @keydown="onKey($event, d.id, false)">
        <div class="absolute inset-0 bg-black/45 backdrop-blur-[2px]" @click="cancel(d.id)" />
        <form class="dlg-card relative w-full sm:max-w-[440px] bg-surface-container-lowest text-on-surface rounded-t-xl sm:rounded-xl shadow-float p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" :aria-label="d.title" @submit.prevent="ok(d.id)">
          <div class="flex items-start gap-3">
            <span v-if="d.icon || d.danger" class="w-11 h-11 rounded-full flex items-center justify-center shrink-0" :class="d.danger ? 'bg-error-container text-error' : 'bg-sunlit text-flame'"><Icon :name="d.icon || 'warning'" /></span>
            <div class="min-w-0 flex-1">
              <h2 class="text-headline-sm">{{ d.title }}</h2>
              <p v-if="d.body" class="text-body-md text-on-surface-variant mt-1 whitespace-pre-line">{{ d.body }}</p>
            </div>
          </div>

          <div v-if="d.fields?.length && values[d.id]" class="mt-4 space-y-3">
            <template v-for="(f, i) in d.fields" :key="f.key">
              <label v-if="f.type === 'text' || f.type === 'textarea'" class="block">
                <span v-if="f.label" class="label">{{ f.label }}</span>
                <input v-if="f.type === 'text'" v-model="(values[d.id][f.key] as string)" class="input h-11 mt-1" :placeholder="f.placeholder" :maxlength="f.maxLength" :data-autofocus="i === 0 ? '' : undefined" @keydown="onKey($event, d.id, false)" />
                <textarea v-else v-model="(values[d.id][f.key] as string)" class="textarea mt-1" rows="3" :placeholder="f.placeholder" :maxlength="f.maxLength" :data-autofocus="i === 0 ? '' : undefined" @keydown.esc="cancel(d.id)" />
                <span v-if="f.suggestions?.length" class="flex flex-wrap gap-1.5 mt-2">
                  <button v-for="sg in f.suggestions" :key="sg" type="button" class="chip h-8 text-label-sm" :class="{ 'chip-active': values[d.id][f.key] === sg }" @click="values[d.id][f.key] = sg">{{ sg }}</button>
                </span>
              </label>
              <label v-else-if="f.type === 'toggle'" class="flex items-center gap-3 rounded-md bg-surface-container-low px-4 py-3 cursor-pointer">
                <span class="flex-1"><span class="text-label-lg block">{{ f.label }}</span><span v-if="f.hint" class="text-body-sm text-on-surface-variant">{{ f.hint }}</span></span>
                <input v-model="(values[d.id][f.key] as boolean)" type="checkbox" class="w-5 h-5 accent-[#ff5e00]" />
              </label>
              <div v-else-if="f.type === 'choices'">
                <span v-if="f.label" class="label">{{ f.label }}</span>
                <div class="grid grid-cols-2 gap-2 mt-1">
                  <button v-for="o in f.options" :key="o.value" type="button" class="h-11 rounded-md border text-label-lg flex items-center gap-2 px-3 text-left" :class="values[d.id][f.key] === o.value ? 'border-flame bg-sunlit ring-2 ring-flame/30' : 'border-sandstone hover:bg-surface-container-low'" @click="values[d.id][f.key] = o.value"><span v-if="o.emoji">{{ o.emoji }}</span>{{ o.label }}</button>
                </div>
              </div>
            </template>
          </div>

          <div class="mt-6 flex gap-2 justify-end">
            <button v-if="!d.hideCancel" type="button" class="btn-secondary h-11" @click="cancel(d.id)">{{ d.cancelText ?? 'Cancel' }}</button>
            <button type="submit" class="btn h-11 text-white disabled:opacity-50" :class="d.danger ? 'bg-error' : 'bg-sunset'" :disabled="!valid(d.id)" :data-autofocus="!d.fields?.length ? '' : undefined">{{ d.confirmText ?? 'OK' }}</button>
          </div>
        </form>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.dlg-enter-active, .dlg-leave-active { transition: opacity 0.18s ease; }
.dlg-enter-active .dlg-card, .dlg-leave-active .dlg-card { transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.dlg-enter-from, .dlg-leave-to { opacity: 0; }
.dlg-enter-from .dlg-card, .dlg-leave-to .dlg-card { transform: translateY(24px) scale(0.97); }
</style>

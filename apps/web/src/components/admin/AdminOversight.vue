<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { timeAgo } from '@chatlol/shared';
import { api } from '../../lib/api';
import { useSession } from '../../stores/session';
import Avatar from '../Avatar.vue';

/** LOLShield's findings on moderators: dismiss false alarms, reinstate staff it removed. Admin-only actions. */
const s = useSession();
const data = ref<Awaited<ReturnType<typeof api.admin.oversight>> | null>(null);
const load = async () => (data.value = await api.admin.oversight());
onMounted(load);
const isAdmin = computed(() => s.user?.role === 'admin');
const LABEL: Record<string, string> = { no_reason: 'No / vague reason', no_evidence: 'No evidence', targeting: 'Targeting one member', mass: 'Mass actions', self_dealing: 'Self-dealing', unjustified: 'Not justified (AI)' };
async function run(p: Promise<unknown>, msg: string) {
  try { await p; s.toast({ kind: 'info', title: msg }); await load(); } catch (e) { s.toast({ kind: 'error', title: (e as Error).message }); }
}
</script>

<template>
  <div v-if="data" class="space-y-4">
    <section class="card p-5 space-y-2">
      <h2 class="text-headline-sm">🛡️ LOLShield oversight</h2>
      <p class="text-body-sm text-on-surface-variant">LOLShield reviews every action by moderators (never admins): missing or vague reasons, actions with no reports or strikes behind them, repeatedly targeting one member, mass actions, and gifting to themselves or friends. Two findings in 30 days are warnings; the third removes their staff role automatically.</p>
    </section>
    <section v-if="data.revoked.length" class="card p-5 space-y-2">
      <p class="label">Staff roles removed by LOLShield</p>
      <div v-for="r in data.revoked" :key="r.user.id" class="flex items-center gap-3 py-1.5">
        <Avatar :user="r.user" :size="32" /><span class="flex-1 text-label-lg">@{{ r.user.handle }} <span class="text-body-sm text-on-surface-variant">was {{ r.from.role }} · {{ timeAgo(r.at) }} ago</span></span>
        <button v-if="isAdmin" class="btn-secondary h-9" @click="run(api.admin.reinstateStaff(r.user.id), 'Reinstated')">Reinstate</button>
      </div>
    </section>
    <section class="card p-5 space-y-1">
      <p class="label mb-2">Findings</p>
      <div v-for="f in data.items" :key="f.id" class="flex items-start gap-3 py-2 border-b border-sandstone last:border-0" :class="{ 'opacity-50': f.cleared }">
        <Avatar :user="f.staff" :size="30" />
        <div class="flex-1 min-w-0 text-body-sm">
          <p><b>@{{ f.staff.handle }}</b> · <span class="chip h-6 text-[10px]">{{ f.kind === 'staff_revoked' ? 'Role removed' : LABEL[f.code ?? ''] ?? f.code }}</span> <span class="text-on-surface-variant">{{ timeAgo(f.createdAt) }} ago{{ f.cleared ? ' · dismissed' : '' }}</span></p>
          <p class="mt-0.5">{{ f.reason }}</p>
          <p v-if="f.action" class="text-on-surface-variant">Action: {{ f.action.kind }}<template v-if="f.action.reason"> — “{{ f.action.reason }}”</template></p>
        </div>
        <button v-if="isAdmin && f.kind === 'mod_violation' && !f.cleared" class="btn-ghost h-8 px-3 shrink-0" @click="run(api.admin.dismissFinding(f.id), 'Dismissed')">Dismiss</button>
      </div>
      <p v-if="!data.items.length" class="text-body-sm text-on-surface-variant">No findings — the team is playing fair.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { iconClass } from '../lib/iconMap';
/** Icon from the Iconsax font. Pass the app's icon name (see lib/iconMap); `size` in px. */
const props = defineProps<{ name: string; fill?: boolean; size?: number }>();
const cls = computed(() => iconClass(props.name));
</script>
<template>
  <i :class="[cls, 'icon']" :style="size ? { fontSize: size + 'px' } : undefined" aria-hidden="true" />
</template>

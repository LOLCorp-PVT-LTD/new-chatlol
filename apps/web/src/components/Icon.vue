<script setup lang="ts">
defineProps<{ name: string; fill?: boolean; size?: number }>();
</script>
<template>
  <span class="icon" :class="{ 'icon-fill': fill }" :style="size ? { fontSize: size + 'px' } : undefined" aria-hidden="true">{{ name }}</span>
</template>

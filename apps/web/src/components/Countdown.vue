<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { countdown } from '@chatlol/shared';
const props = defineProps<{ to: string }>();
const text = ref(countdown(props.to));
const t = setInterval(() => (text.value = countdown(props.to)), 1000);
onUnmounted(() => clearInterval(t));
</script>
<template><span class="tabular-nums">{{ text }}</span></template>

<script setup lang="ts">
import Empty from '../components/Empty.vue';
</script>
<template>
  <div class="text-center">
    <img src="/brand/mascot.webp" alt="" class="h-32 w-auto mx-auto mt-10 grayscale-[30%] -rotate-12" />
    <Empty emoji="" title="This vibe drifted away" body="The page you’re looking for doesn’t exist."><RouterLink to="/" class="btn-primary">Back to the Stream</RouterLink></Empty>
  </div>
</template>

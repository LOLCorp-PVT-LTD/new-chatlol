import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // <emoji-picker> is a web component (emoji-picker-element).
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'emoji-picker' } } })],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': { target: 'ws://localhost:4000', ws: true },
    },
  },
});

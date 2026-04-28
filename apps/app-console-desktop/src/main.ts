import { createApp } from 'vue';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import router from './router';
import './style.css';

// Sync system color scheme to dark class on <html>
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
document.documentElement.classList.toggle('dark', darkMq.matches);
darkMq.addEventListener('change', e => {
  document.documentElement.classList.toggle('dark', e.matches);
});

createApp(App).use(ui).use(router).mount('#app');

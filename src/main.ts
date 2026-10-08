import { createApp } from 'vue';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import { router } from './router';
import './styles.css';

createApp(App).use(router).use(ui).mount('#root');

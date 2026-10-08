import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from './app-layout.vue';

export const routes = [
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', component: () => import('./routes/home-page.vue') },
      { path: 'config', component: () => import('./routes/config-page.vue') },
      { path: 'device', component: () => import('./routes/device-page.vue') },
      {
        path: 'display/:displayId',
        component: () => import('./routes/display-page.vue'),
      },
      {
        path: ':pathMatch(.*)*',
        component: () => import('./routes/not-found-page.vue'),
      },
    ],
  },
];
export const router = createRouter({ history: createWebHistory(), routes });

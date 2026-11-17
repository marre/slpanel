import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import AppLayout from './app-layout.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', component: () => import('./routes/home-page.vue') },
      { path: 'devices', component: () => import('./routes/devices-page.vue') },
      { path: 'scenes', component: () => import('./routes/scenes-page.vue') },
      {
        path: 'schedules',
        component: () => import('./routes/schedules-page.vue'),
      },
      {
        path: 'config',
        redirect: (to) => ({
          path: '/devices',
          query: to.query,
        }),
      },
      {
        path: 'presentations',
        redirect: (to) => ({
          path: '/scenes',
          query: to.query,
        }),
      },
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

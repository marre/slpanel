import { h, type VNode, type Component } from 'vue';
import { render as renderVue } from '@testing-library/vue';
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type RouteRecordRaw,
} from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';

type Fixture = { entries: string[]; children: unknown[] };
type TestRoute = { path?: string; element?: VNode; children?: unknown[] };
export function routerFixture(entries: string[], children: unknown[]): Fixture {
  return { entries, children };
}
function routesFrom(children: unknown[]): RouteRecordRaw[] {
  return children.flatMap((child) => {
    if (Array.isArray(child)) return routesFrom(child);
    const route = child as TestRoute;
    if (!route.element) return [];
    return [
      {
        path: route.path ?? '/',
        component: { render: () => route.element },
        children: routesFrom(route.children ?? []),
      } as RouteRecordRaw,
    ];
  });
}
export async function render(input: VNode | Fixture) {
  if ('entries' in input) {
    const routes = routesFrom(input.children);
    const child = input.children.find(
      (item) => item && !Array.isArray(item) && 'type' in (item as object),
    ) as VNode | undefined;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes.length
        ? routes
        : [{ path: '/:pathMatch(.*)*', component: { render: () => child } }],
    });
    await router.push(input.entries[0] ?? '/');
    await router.isReady();
    return renderVue(
      { render: () => h(RouterView) },
      { global: { plugins: [router, ui] } },
    );
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/');
  await router.isReady();
  const result = renderVue(input.type as Component, {
    props: input.props ?? {},
    global: { plugins: [router, ui] },
  });
  return {
    ...result,
    rerender: (next: VNode) => result.rerender(next.props ?? {}),
  };
}

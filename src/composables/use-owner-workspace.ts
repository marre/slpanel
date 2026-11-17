import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const VALID_OWNER = /^[A-Za-z0-9]{8}$/;
const STORAGE_KEY = 'slpanel.owner-id';

/** Shared owner context for Devices, Scenes and Schedules. */
export function useOwnerWorkspace() {
  const route = useRoute();
  const router = useRouter();
  const owner = computed(() => typeof route.query.owner === 'string' ? route.query.owner : '');
  const ownerInput = ref(owner.value);
  const ownerError = ref('');
  watch(owner, (value) => {
    ownerInput.value = value;
    ownerError.value = '';
    if (VALID_OWNER.test(value)) window.localStorage.setItem(STORAGE_KEY,value);
  }, { immediate: true });
  onMounted(() => {
    if (owner.value) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_OWNER.test(stored))
      void router.replace({ query: { ...route.query, owner: stored } });
  });
  function loadOwner() {
    const value = ownerInput.value.trim();
    if (!VALID_OWNER.test(value)) {
      ownerError.value = 'Owner ID must be exactly 8 letters or digits.';
      return;
    }
    ownerError.value = '';
    void router.push({ query: { ...route.query, owner: value } });
  }
  function toWorkspace(path: string) {
    return { path, query: owner.value ? { owner: owner.value } : {} };
  }
  return { owner, ownerInput, ownerError, loadOwner, toWorkspace };
}

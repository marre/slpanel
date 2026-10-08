<script setup lang="ts">
import { computed } from 'vue';
import { useDisplayCanvas } from '@/composables/use-display-canvas';
import {
  buildAccessibleSummary,
  PANEL_WIDTH,
  PANEL_HEIGHT,
  slugify,
  type DisplayBoardProps,
} from '@/components/display-board-shared';
const props = defineProps<DisplayBoardProps>();
const { canvasRef } = useDisplayCanvas(props);
const accessibleSummary = computed(() => buildAccessibleSummary(props));
</script>
<template>
  <div
    data-testid="classic-display-board"
    class="w-full max-w-[68rem] rounded-xl border border-[var(--panel-border)] bg-[linear-gradient(180deg,rgba(18,24,28,0.96),rgba(6,9,12,0.98))] p-2 shadow-sm md:p-3"
  >
    <div
      class="w-full rounded-lg border border-black/70 bg-[radial-gradient(circle_at_top,rgba(255,176,84,0.06),transparent_40%),#000] p-2"
    >
      <canvas
        ref="canvasRef"
        :width="PANEL_WIDTH"
        :height="PANEL_HEIGHT"
        role="img"
        :aria-label="`SL departure board for ${displayName}`"
        :aria-describedby="`display-board-summary-${slugify(displayName)}`"
        class="h-auto w-full rounded-[0.6rem] bg-black"
      ></canvas>
      <p :id="`display-board-summary-${slugify(displayName)}`" class="sr-only">
        {{ accessibleSummary }}
      </p>
    </div>
  </div>
</template>

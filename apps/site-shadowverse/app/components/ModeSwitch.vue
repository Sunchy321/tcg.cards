<template>
  <div class="mode-switch" role="group" aria-label="游戏模式">
    <button
      v-for="item in gameModeKeys"
      :key="item"
      type="button"
      class="mode-switch-option"
      :class="{ active: mode === item }"
      @click="setMode(item)"
    >
      <UIcon :name="gameModes[item].icon" class="size-4" />
      {{ gameModes[item].name }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { gameModeKeys, gameModes } from '~/composables/gameModes';

const { mode, setMode } = useGameMode();
</script>

<style scoped>
.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid rgb(191 219 254 / 0.16);
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.07);
  padding: 0.25rem;
}

.mode-switch-option {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 9999px;
  padding: 0.42rem 0.9rem;
  color: rgb(239 246 255 / 0.72);
  font-size: 0.86rem;
  font-weight: 750;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.mode-switch-option:hover {
  color: #fff;
}

.mode-switch-option.active {
  background: var(--mode-accent-600);
  color: #fff;
}
</style>

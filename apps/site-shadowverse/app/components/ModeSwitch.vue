<template>
  <div class="mode-switch" :class="{ 'is-evolve': mode === 'evolve' }" role="group" aria-label="游戏模式">
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
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(5.8rem, 1fr));
  align-items: center;
  gap: 0.25rem;
  border: 1px solid rgb(191 219 254 / 0.16);
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.07);
  padding: 0.25rem;
}

.mode-switch::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0.25rem;
  width: calc((100% - 0.75rem) / 2);
  border-radius: 9999px;
  background: var(--mode-accent-600);
  content: '';
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s ease;
}

.mode-switch.is-evolve::before {
  transform: translateX(calc(100% + 0.25rem));
}

.mode-switch-option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 0.35rem;
  border-radius: 9999px;
  padding: 0.42rem 0.9rem;
  color: rgb(239 246 255 / 0.72);
  font-size: 0.86rem;
  font-weight: 750;
  cursor: pointer;
  transition: color 0.2s ease;
}

.mode-switch-option:hover {
  color: #fff;
}

.mode-switch-option.active {
  color: #fff;
}
</style>

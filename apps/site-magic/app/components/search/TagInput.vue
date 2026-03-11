<template>
  <div class="flex flex-col gap-1.5">
    <!-- Existing tags -->
    <div v-if="modelValue.length > 0" class="flex flex-wrap gap-1">
      <span
        v-for="(tag, i) in modelValue"
        :key="tag"
        class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-white text-xs"
      >
        {{ tag }}
        <button
          class="ml-0.5 text-indigo-400 hover:text-indigo-700 dark:text-white/60 dark:hover:text-white leading-none"
          @click="remove(i)"
        >×</button>
      </span>
      <button
        class="px-1.5 py-0.5 rounded-full text-xs text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition"
        @click="emit('update:modelValue', [])"
      >{{ $t('magic.search.advanced.clear-all') }}</button>
    </div>

    <!-- Input row -->
    <div class="flex gap-2">
      <input
        v-model="inputVal"
        :placeholder="placeholder"
        class="flex-1 bg-white border border-gray-300 dark:border-white/20 dark:bg-white/10 rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-white/40"
        @keydown.enter.prevent="add"
      >
      <button
        class="px-3 py-1.5 rounded-md text-sm bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition"
        @click="add"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue:   string[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const inputVal = ref('');

const add = () => {
  const v = inputVal.value.trim();
  if (v && !props.modelValue.includes(v)) {
    emit('update:modelValue', [...props.modelValue, v]);
  }
  inputVal.value = '';
};

const remove = (i: number) => {
  const arr = [...props.modelValue];
  arr.splice(i, 1);
  emit('update:modelValue', arr);
};
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-8">
    <NuxtLink to="/" class="inline-flex w-fit items-center gap-2 text-sm text-white/70 hover:text-white">
      <UIcon name="lucide:arrow-left" class="size-4" />
      游戏王首页
    </NuxtLink>

    <section class="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-white/16 bg-black/20 p-10 text-center">
      <div class="mb-5 flex size-16 items-center justify-center rounded-full bg-orange-400/12 text-orange-200">
        <UIcon :name="icon" class="size-8" />
      </div>
      <h1 class="text-3xl font-semibold text-white">
        {{ title }}
      </h1>
      <p class="mt-4 max-w-xl leading-7 text-white/65">
        {{ description }}
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
defineProps<{
  title:       string;
  description: string;
  icon:        string;
}>();
</script>

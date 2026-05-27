<template>
  <main class="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <NuxtLink to="/" class="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
        <UIcon name="lucide:arrow-left" class="size-4" />
        游戏王首页
      </NuxtLink>
    </header>

    <section class="rounded-lg border border-white/12 bg-white/8 p-5">
      <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="submit">
        <UInput
          v-model="input"
          size="xl"
          icon="lucide:search"
          class="flex-1"
          placeholder="输入卡名或效果文本"
        />
        <UButton type="submit" size="xl" icon="lucide:search">
          搜索
        </UButton>
      </form>
    </section>

    <section class="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-white/16 bg-black/20 p-10 text-center">
      <UIcon name="lucide:database" class="mb-4 size-12 text-orange-200/80" />
      <h1 class="text-2xl font-semibold text-white">
        游戏王搜索页已就位
      </h1>
      <p class="mt-3 max-w-xl leading-7 text-white/65">
        当前只保留页面壳子和查询参数承接。之后接入数据源后，这里会展示搜索结果。
      </p>
      <p v-if="query" class="mt-5 rounded-md bg-white/10 px-3 py-2 font-mono text-sm text-orange-100">
        q={{ query }}
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
const route = useRoute();
const router = useRouter();

const query = computed(() => typeof route.query.q === 'string' ? route.query.q : '');
const input = ref(query.value);

watch(query, value => {
  input.value = value;
});

useHead({
  title: 'Yu-Gi-Oh! Search | TCG Cards',
});

const submit = async () => {
  const q = input.value.trim();

  await router.replace({
    path:  '/search',
    query: q ? { q } : {},
  });
};
</script>

<script setup lang="ts">
const route = useRoute();
const params = computed(() => route.params as { game?: string, slug?: string[] | string });
const game = computed(() => String(params.value.game ?? ''));
const slug = computed(() => Array.isArray(params.value.slug) ? params.value.slug.map(String).join('/') : String(params.value.slug ?? ''));

await navigateTo(`/v1/${game.value}/model${slug.value ? `/${slug.value}` : ''}`, { redirectCode: 301 });
</script>

export default defineNuxtPlugin(() => {
  const router = useRouter();
  const title = useTitle();
  const titleType = useTitleType();

  router.beforeEach(to => {
    title.value = to.meta.title ?? '';
    titleType.value = to.meta.titleType ?? 'text';
  });

  // initialize
  const route = useRoute();
  title.value = route.meta.title ?? '';
  titleType.value = route.meta.titleType ?? 'text';
});

export const useTitle = () => {
  const route = useRoute();

  const title = useState('title', () => route.meta.title ?? '');

  useHead({ title });

  return title;
};

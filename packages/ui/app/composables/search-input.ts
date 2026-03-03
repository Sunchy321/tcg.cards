export const useSearchInput = () => {
  const searchInput = useState('search-input', () => '');
  const route = useRoute();

  watch(
    () => route.query.q as string | undefined,
    q => {
      if (q) {
        searchInput.value = q;
      }
    },
    {
      immediate: true,
    },
  );

  return searchInput;
};

/** Shares the database series catalog between browsing and card details. */
export function useHearthstoneSets() {
  const { $orpc } = useNuxtApp();
  return useAsyncData('hearthstone-sets', () => $orpc.hearthstone.set.list(), {
    default: () => [],
  });
}

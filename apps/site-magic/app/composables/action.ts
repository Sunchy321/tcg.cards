export const useMagicActions = () => {
  const { $orpc } = useNuxtApp();

  const random = {
    id:      'random',
    icon:    'lucide:shuffle',
    handler: async () => {
      const cardId = await $orpc.magic.card.random();

      await navigateTo(`/magic/card/${cardId}`);
    },
  };

  return { random };
};

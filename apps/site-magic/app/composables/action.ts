export const getMagicActionMeta = () => {
  const random = {
    id:   'random',
    icon: 'lucide:shuffle',
  };

  return { random };
};

export const useMagicActions = () => {
  const meta = getMagicActionMeta();

  const { $orpc } = useNuxtApp();

  const random = {
    ...meta.random,
    handler: async () => {
      const cardId = await $orpc.magic.card.random();

      await navigateTo(`/magic/card/${cardId}`);
    },
  };

  return { random };
};

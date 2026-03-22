export const getHearthstoneActionMeta = () => {
  const random = {
    id:   'random',
    icon: 'lucide:shuffle',
  };

  return { random };
};

export const useHearthstoneActions = () => {
  const meta = getHearthstoneActionMeta();

  const { $orpc } = useNuxtApp();

  const random = {
    ...meta.random,
    handler: async () => {
      const cardId = await $orpc.hearthstone.card.random();

      await navigateTo(`/card/${cardId}`);
    },
  };

  return { random };
};

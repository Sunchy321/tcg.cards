export const getHearthstoneActionMeta = () => {
  const random = {
    id:   'random',
    icon: 'lucide:shuffle',
  };

  return { random };
};

export const useHearthstoneActions = () => {
  const meta = getHearthstoneActionMeta();

  const random = {
    ...meta.random,
    handler: async () => {
      const cardId = await $fetch<string>('/api/hearthstone/random-card');

      await navigateTo(`/card/${cardId}`);
    },
  };

  return { random };
};

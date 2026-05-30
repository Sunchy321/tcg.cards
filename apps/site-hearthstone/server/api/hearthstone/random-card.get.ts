import { getRandomCardId } from '~~/server/utils/random-card';

export default defineEventHandler(async () => {
  const cardId = await getRandomCardId();

  if (cardId == null) {
    throw createError({ statusCode: 404, statusMessage: 'No card available' });
  }

  return cardId;
});

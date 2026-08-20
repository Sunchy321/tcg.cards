import { os } from '../orpc';

import { API_GAMES } from '@tcg-cards/api/games';

export const games = os.games
  .handler(async () => [...API_GAMES]);

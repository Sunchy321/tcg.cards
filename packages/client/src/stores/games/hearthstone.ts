import { defineGameStore } from './game';

import { Locale } from '@model/hearthstone/schema/basic';

export const useGame = defineGameStore<'hearthstone', unknown, Locale>('hearthstone', { });

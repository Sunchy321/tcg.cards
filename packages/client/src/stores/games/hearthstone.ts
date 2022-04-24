import { defineGameStore } from './game';

interface Data {
    locales: string[];
}

export const useHearthstone = defineGameStore<'hearthstone', Data, unknown>('hearthstone', { });

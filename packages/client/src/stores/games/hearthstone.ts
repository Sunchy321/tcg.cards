import { defineGameStore } from './game';

interface Data {
    locales: string[];
    modes: string[];
}

export const useHearthstone = defineGameStore<'hearthstone', Data, unknown>('hearthstone', { });

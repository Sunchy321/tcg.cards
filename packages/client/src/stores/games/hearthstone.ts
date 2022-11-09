import { defineGameStore } from './game';

interface Data {
    birthday: string;
    locales: string[];
    formats: string[];
}

export const useHearthstone = defineGameStore<'hearthstone', Data, unknown>('hearthstone', { });

import { createStore as vuexCreateStore } from 'vuex';

import { StoreOptions } from './interface';
import { StoreType } from './store-type';

export default function createStore<
    SO extends StoreOptions<any, any, any, any, any>,
>(option: SO): StoreType<SO> {
    return vuexCreateStore(option) as unknown as StoreType<SO>;
}

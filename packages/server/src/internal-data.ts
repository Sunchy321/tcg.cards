import internalDataDetail from '@data/index';

import { dataPath, internalDataPath } from '@/config';

export default function internalData<T = any>(id: string): T {
    return internalDataDetail<T>(
        internalDataPath ?? dataPath,
        id,
    );
}

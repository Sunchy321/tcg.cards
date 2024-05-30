import { Schema } from 'mongoose';

import { WithUpdation } from '@common/model/updation';

export function historyPlugin<T extends WithUpdation<any>>(schema: Schema<T>): void {
    schema.pre('save', async () => {

    });
}

import { WithUpdation, defaultToJSON } from '../updation';

import { Card } from '@interface/hearthstone/card';

export type ICardDatabase = WithUpdation<Card>;

export const toJSON = defaultToJSON;

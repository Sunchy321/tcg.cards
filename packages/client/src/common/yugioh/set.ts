import makeProfile from '../profile';

import { SetLocalization as RawSetLocalization } from 'interface/yugioh/set';

export type SetLocalization = Omit<RawSetLocalization, 'lang'>;

export interface SetProfile {
    setId:        string;
    localization: Record<string, SetLocalization>;
    type:         string;
    releaseDate?: string;
}

export default makeProfile<SetProfile>('yugioh/set/profile', 'setId', '/yugioh/set/profile');

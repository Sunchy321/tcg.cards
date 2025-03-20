import makeProfile from '../profile';

import { SetLocalization as RawSetLocalization } from 'interface/hearthstone/set';

export type SetLocalization = Omit<RawSetLocalization, 'lang'>;

export interface SetProfile {
    setId:        string;
    localization: Record<string, SetLocalization>;
    releaseDate?: string;
}

export default makeProfile<SetProfile>('hearthstone/set/profile', 'setId', '/hearthstone/set/profile');

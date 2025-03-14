import makeProfile from '../profile';

import { SetLocalization as RawSetLocalization } from 'interface/lorcana/set';

export type SetLocalization = Omit<RawSetLocalization, 'lang'>;

export interface SetProfile {
    setId: string;
    localization: Record<string, SetLocalization>;
    type: string;
    releaseDate?: string;
}

export default makeProfile<SetProfile>('lorcana/set/profile', 'setId', '/lorcana/set/profile');

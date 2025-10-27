import makeProfile from '../profile';

import { SetLocalization } from '@model/hearthstone/schema/set';

export interface SetProfile {
    setId:        string;
    localization: SetLocalization[];
    releaseDate?: string;
}

export default makeProfile<SetProfile>('hearthstone/set/profile', 'setId', '/hearthstone/set/profile');

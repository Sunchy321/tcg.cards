import makeProfile from '../profile';

import { SetLocalization as RawSetLocalization } from 'interface/magic/set';

export type SetLocalization = Omit<RawSetLocalization, 'lang'>;

export interface SetProfile {
    setId:            string;
    parent?:          string;
    localization:     Record<string, SetLocalization>;
    type:             string;
    symbolStyle?:     string[];
    doubleFacedIcon?: string[];
    releaseDate?:     string;
}

export default makeProfile<SetProfile>('magic/set/profile', 'setId', '/magic/set/profile');

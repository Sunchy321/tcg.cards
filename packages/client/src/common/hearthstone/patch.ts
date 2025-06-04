import makeProfile from '../profile';

import { Patch } from '@interface/hearthstone/patch';

export type PatchProfile = Patch;

export default makeProfile<PatchProfile>('hearthstone/patch/profile', 'number', '/hearthstone/patch/profile');

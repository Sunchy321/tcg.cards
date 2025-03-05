import makeProfile from '../profile';

export interface EntityProfile {
    entityId: string;

    localization: {
        lang: string;
        name: string;
    }[];

    versions: number[][];
}

export default makeProfile<EntityProfile>('hearthstone/entity/profile', 'entityId', '/hearthstone/entity/profile');

import makeProfile from '../profile';

export interface EntityProfile {
    cardId: string;

    localization: {
        lang: string;
        name: string;
    }[];

    versions: number[][];
}

export default makeProfile<EntityProfile>('hearthstone/entity/profile', 'cardId', '/hearthstone/entity/profile');

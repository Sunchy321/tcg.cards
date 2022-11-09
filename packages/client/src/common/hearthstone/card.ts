import makeProfile from '../profile';

export interface CardProfile {
    cardId: string;

    localization: {
        lang: string;
        name: string;
    }[];

    versions: number[][];
}

export default makeProfile<CardProfile>('hearthstone/card/profile', 'cardId', '/hearthstone/card/profile');

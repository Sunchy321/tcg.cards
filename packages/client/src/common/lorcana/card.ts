import makeProfile from '../profile';

export interface CardProfile {
    cardId: string;

    localization: {
        lang: string;
        name: string;
    }[];

    versions: {
        lang:        string;
        set:         string;
        number:      string;
        rarity:      string;
        layout:      string;
        releaseDate: string;
    }[];
}

export default makeProfile<CardProfile>('lorcana/card/profile', 'cardId', '/lorcana/card/profile');

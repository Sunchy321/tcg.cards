import makeProfile from '../profile';

export interface CardProfile {
    cardId: string;

    parts: {
        localization: {
            lang: string;
            name: string;
        }[];
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

export default makeProfile<CardProfile>('magic/card/profile', 'cardId', '/magic/card/profile');

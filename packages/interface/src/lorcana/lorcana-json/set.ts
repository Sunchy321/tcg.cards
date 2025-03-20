export type Type = 'expansion' | 'quest';

export type Set = {
    prereleaseDate: string;
    releaseDate:    string;
    hasAllCards:    boolean;
    type:           Type;
    number:         number;
    name:           string;
};

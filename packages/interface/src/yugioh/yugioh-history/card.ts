export interface Card {
    id:                 number;
    type:               string;
    name:               string;
    englishAttribute:   string;
    localizedAttribute: string;
    effectText:         string;
    level?:             number;
    atk?:               number;
    def?:               number;
    properties?:        string[];
    rank?:              number;
    englishProperty?:   string;
    localizedProperty?: string;
    pendEffect?:        string;
    pendScale?:         number;
    linkRating?:        number;
    linkArrows?:        string[];
    notes?:             string;
    oldName?:           string;
}

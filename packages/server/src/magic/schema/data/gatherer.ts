import { integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

import { schema } from '../schema';

export const Gatherer = schema.table('data_gatherer', {
    multiverseId: integer('multiverse_id').primaryKey(),
    data:         jsonb('data').$type<GathererData>().notNull(),
    createdAt:    timestamp('created_at').notNull().defaultNow(),
    expiresAt:    timestamp('expires_at').notNull(),
});

export interface GathererData {
    resourceId:          string;
    multiverseId:        number;
    kind:                'CardData';
    id:                  string;
    convertedManaCost:   string;
    cardColor:           string;
    cardNumber:          string;
    cardNumberVariant:   string;
    englishLanguageName: string;
    instanceName:        string;
    language: {
        englishName:     string;
        originalName:    string;
        isoCountryCode:  string;
        isoLanguageCode: string;
        code:            string;
    };
    languageCode:       string;
    nativeLanguageName: string;
    oracleName:         string;
    nameKebab:          string;
    rarityCode:         string;
    rarityName:         string;
    setCode:            string;
    setName:            string;
    artistName:         string;
    flavorText:         string;
    instanceManaText:   string;
    instanceSubtype:    string;
    instanceText:       string;
    instanceType:       string;
    instanceTypeLine:   string;
    oracleManaText:     string;
    oracleSubtype:      string;
    oracleText:         string;
    oracleType:         string;
    oracleTypeLine:     string;
    oracleTypes:        string[];
    oracleSubtypes:     string[];
    oracleSupertypes:   string[];
    instanceTypes:      string[];
    instanceSubtypes:   string[];
    instanceSupertypes: string[];
    imageUrls:          Record<string, string>;

    colors: {
        colorCode: string;
        colorName: string;
    }[];

    formatLegalities: {
        formatName: string;
        legality:   string;
    }[];

    relatedCardInstances: {
        cardNumber:        string;
        cardNumberVariant: string;
        instanceName:      string;
        languageCode:      string;
        oracleName:        string;
        nameKebab:         string;
        resourceId:        string;
        setCode:           string;
        setName:           string;
        setReleaseDate:    string;
        imageUrls:         Record<string, string>;
    }[];

    rulings: {
        rulingDate:      string;
        rulingStatement: string;
    }[];

    setReleaseDate: string;

    otherLanguages: {
        englishName:     string;
        originalName:    string;
        isoCountryCode:  string;
        isoLanguageCode: string;
        code:            string;
    }[];

}

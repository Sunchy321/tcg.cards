export declare const appRouter: import('@trpc/server').TRPCBuiltRouter<{
    ctx:         object;
    meta:        object;
    errorShape:  import('@trpc/server').TRPCDefaultErrorShape;
    transformer: false;
}, import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        root: import('@trpc/server').TRPCQueryProcedure<{
            input:  void;
            output: {
                games: readonly ('magic' | 'ptcg' | 'yugioh' | 'hearthstone' | 'lorcana')[];
            };
            meta: object;
        }>;
        magic: import('@trpc/server').TRPCBuiltRouter<{
            ctx:         object;
            meta:        object;
            errorShape:  import('@trpc/server').TRPCDefaultErrorShape;
            transformer: false;
        }, import('@trpc/server').TRPCDecorateCreateRouterOptions<{
                card: import('@trpc/server').TRPCBuiltRouter<{
                    ctx:         object;
                    meta:        object;
                    errorShape:  import('@trpc/server').TRPCDefaultErrorShape;
                    transformer: false;
                }, import('@trpc/server').TRPCDecorateCreateRouterOptions<{
                        random: import('@trpc/server').TRPCQueryProcedure<{
                            input:  void;
                            output: string;
                            meta:   object;
                        }>;
                        fuzzy: import('@trpc/server').TRPCQueryProcedure<{
                            input: {
                                id:         string;
                                lang?:      'en' | 'zhs' | 'zht' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'es' | 'ph' | 'he' | 'ar' | 'sa' | 'grc' | 'la' | 'qya' | undefined;
                                set?:       string | undefined;
                                number?:    string | undefined;
                                partIndex?: number | undefined;
                            };
                            output: {
                                cardId:    string;
                                set:       string;
                                number:    string;
                                lang:      string;
                                partIndex: number;
                                card: {
                                    tags:             string[];
                                    name:             string;
                                    typeline:         string;
                                    text:             string;
                                    manaValue:        number;
                                    colorIdentity:    string;
                                    keywords:         string[];
                                    counters:         string[];
                                    producibleMana:   string | null;
                                    category:         'advertisement' | 'art' | 'auxiliary' | 'decklist' | 'default' | 'minigame' | 'player' | 'token';
                                    legalities:       Record<string, 'banned' | 'legal' | 'unavailable' | 'banned_as_commander' | 'banned_as_companion' | 'banned_in_bo1' | 'game_changer' | 'restricted' | 'suspended' | 'score-8' | 'score-7' | 'score-6' | 'score-5' | 'score-4' | 'score-3' | 'score-2' | 'score-1' | 'score-9' | 'score-10'>;
                                    contentWarning:   boolean | null;
                                    partCount:        number;
                                    scryfallOracleId: string[];
                                };
                                cardLocalization: {
                                    name:     string;
                                    typeline: string;
                                    text:     string;
                                };
                                cardPart: {
                                    name:           string;
                                    typeline:       string;
                                    text:           string;
                                    cost:           string[] | null;
                                    manaValue:      number | null;
                                    color:          string | null;
                                    colorIndicator: string | null;
                                    typeSuper:      string[] | null;
                                    typeMain:       string[];
                                    typeSub:        string[] | null;
                                    power:          string | null;
                                    toughness:      string | null;
                                    loyalty:        string | null;
                                    defense:        string | null;
                                    handModifier:   string | null;
                                    lifeModifier:   string | null;
                                };
                                cardPartLocalization: {
                                    name:       string;
                                    typeline:   string;
                                    text:       string;
                                    __lastDate: string;
                                };
                                print: {
                                    name:              string;
                                    typeline:          string;
                                    text:              string;
                                    layout:            'normal' | 'token' | 'adventure' | 'aftermath' | 'augment' | 'battle' | 'class' | 'double_faced' | 'emblem' | 'flip_token_bottom' | 'flip_token_top' | 'flip' | 'host' | 'leveler' | 'meld' | 'modal_dfc' | 'multipart' | 'planar' | 'reversible_card' | 'saga' | 'scheme' | 'split_arena' | 'split' | 'transform_token' | 'transform' | 'vanguard' | 'case' | 'mutate' | 'prototype';
                                    frame:             '1993' | '1997' | '2003' | '2015' | 'future';
                                    frameEffects:      string[];
                                    borderColor:       'white' | 'black' | 'gold' | 'borderless' | 'silver' | 'yellow';
                                    cardBack:          string | null;
                                    securityStamp:     'arena' | 'acorn' | 'circle' | 'heart' | 'oval' | 'triangle' | null;
                                    promoTypes:        string[] | null;
                                    rarity:            'common' | 'rare' | 'special' | 'uncommon' | 'mythic' | 'bonus';
                                    releaseDate:       string;
                                    isDigital:         boolean;
                                    isPromo:           boolean;
                                    isReprint:         boolean;
                                    finishes:          ('etched' | 'foil' | 'nonfoil')[];
                                    hasHighResImage:   boolean;
                                    imageStatus:       'highres_scan' | 'lowres' | 'missing' | 'placeholder';
                                    inBooster:         boolean;
                                    games:             ('arena' | 'mtgo' | 'paper' | 'astral' | 'sega')[];
                                    arenaId:           number | null;
                                    mtgoId:            number | null;
                                    mtgoFoilId:        number | null;
                                    multiverseId:      number[];
                                    tcgPlayerId:       number | null;
                                    cardMarketId:      number | null;
                                    printTags:         string[];
                                    scryfallOracleId:  string;
                                    previewDate:       string | null;
                                    previewSource:     string | null;
                                    previewUri:        string | null;
                                    scryfallCardId:    string | null;
                                    scryfallFace:      'back' | 'bottom' | 'front' | 'top' | null;
                                    scryfallImageUris: Record<string, string>[] | null;
                                };
                                printPart: {
                                    name:             string;
                                    typeline:         string;
                                    text:             string;
                                    attractionLights: string | null;
                                    flavorName:       string | null;
                                    flavorText:       string | null;
                                    artist:           string | null;
                                    watermark:        string | null;
                                    scryfallIllusId:  string[] | null;
                                };
                                versions: {
                                    set:    string;
                                    number: string;
                                    lang:   string;
                                    rarity: 'common' | 'rare' | 'special' | 'uncommon' | 'mythic' | 'bonus';
                                }[];
                                relatedCards: {
                                    relation: string;
                                    cardId:   string;
                                    version?: {
                                        set:    string;
                                        number: string;
                                        lang:   string;
                                        rarity: 'common' | 'rare' | 'special' | 'uncommon' | 'mythic' | 'bonus';
                                    } | undefined;
                                }[];
                                rulings: {
                                    cardId:   string;
                                    source:   string;
                                    date:     string;
                                    text:     string;
                                    richText: string;
                                }[];
                            } | undefined;
                            meta: object;
                        }>;
                    }>>;
            }>>;
    }>>;
export type AppRouter = typeof appRouter;

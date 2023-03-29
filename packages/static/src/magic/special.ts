export const auxSetType = [
    'promo',
    'token',
    'memorabilia',
    'funny',
    'masters',
    'planechase',
    'box',
    'archenemy',
    'expansion',
];

export const parenBlacklist = [
    'abgerundet',
    'aufgerundet',
    'aufgerundete',
    'beides bis zum Ende des Zuges',

    'またはその組み合わせ',
    'または両方',
    '端数切捨て',
    '端数切り捨て',
    '端数切り上げ',
    '１色または複数の色の組み合わせ',

    'любой',
    'или',
    'их',
    'ее',
    'о',
    'n',
];

export const parenPrefixBlacklist = [
    'エンチャント',
    'プロテクション',
    '親和',
    '献身',
    '連繋',
    '覇権',
];

export const commaBlacklist = [
    'Enchant',
    'Verzaubert',
    '结附',
    '結附',
    'エンチャント',
    'Encantar',

    'Partner',
    'Partenariat',
    'Parceiro',
    'Parceira',
    'Партнер',
    'Camarada',
];

export const commaSuffixBlacklist = [
    'の共闘',
];

export const parenRegex = new RegExp(`(?<!${parenPrefixBlacklist.join('|')}) *[(（](?!-|(${parenBlacklist.join('|')})[)）])([^（()）]+|[^（()）]+[(（][^（()）]+[)）][^（()）]+)[)）](?!-) *`);
export const commaRegex = new RegExp(`^(?!${commaBlacklist.join('|')}).+[,，、;；].+[^\\],，.。—～:"“»'」)!！?？］〕](?<!${commaSuffixBlacklist.join('|')})$`, 'm');

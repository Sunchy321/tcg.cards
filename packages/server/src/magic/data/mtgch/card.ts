import { mtgchCard, type MtgchCard } from '@model/magic/schema/data/mtgch/card';

export async function getMtgchCard(set: string, number: string): Promise<MtgchCard> {
    const url = `https://mtgch.com/api/v1/card/${set.toLowerCase()}/${number}/`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch card from MTGCH: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const result = mtgchCard.parse(data);

    if (result.zhs_text != null) {
        result.zhs_text = result.zhs_text
            .replaceAll(/\\n/g, '\n')
            // oW -> {W}
            .replace(/\b((?:o[oc]?[A-Z0-9])+)\b/g, (_, symbols) => {
                return (symbols as string)
                    .split(/(o[oc]?[A-Z0-9])/)
                    .filter(v => v != '')
                    .map(v => {
                        const symbol = '{' + v.replace(/^o[oc]?/, '') + '}';

                        if (v.startsWith('oo')) {
                            return symbol + ':';
                        } else {
                            return symbol;
                        }
                    })
                    .join('');
            });
    }

    if (result.zhs_flavor_text != null) {
        result.zhs_flavor_text = result.zhs_flavor_text.replaceAll(/\\n/g, '\n');
    }

    return result;
}

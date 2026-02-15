export function normalizeText(text: string): string {
    return text
        .replace(/\\n/g, '\n')
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
        }); ;
}

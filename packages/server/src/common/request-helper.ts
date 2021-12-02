export function toSingle(param: string[] | string): string {
    if (typeof param === 'string') {
        return param;
    } else {
        return param[0];
    }
}

export function toMultiple(param: string[] | string): string[] {
    if (typeof param === 'string') {
        return param.split(',');
    } else {
        const result = [];

        for (const v of param) {
            result.push(...v.split(','));
        }

        return result;
    }
}

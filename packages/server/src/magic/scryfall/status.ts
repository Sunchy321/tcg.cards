export interface Status {
    method: 'get' | 'load' | 'merge',
    type: 'card' | 'ruling' | 'set' | 'image',

    amount: {
        updated?: number;
        count: number;
        total?: number;
    };

    time?: {
        elapsed: number;
        remaining: number;
    };
}

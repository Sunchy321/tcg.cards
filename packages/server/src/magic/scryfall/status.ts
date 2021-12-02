export interface Status {
    method: 'get' | 'load' | 'merge';
    type: 'card' | 'image' | 'ruling' | 'set';

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

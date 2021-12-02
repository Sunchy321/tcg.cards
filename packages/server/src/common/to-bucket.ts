export function* toGenerator<T>(arr: T[]): Generator<T> {
    for (const v of arr) {
        yield v;
    }
}

export function* toBucket<T>(gen: Generator<T>, size: number): Generator<T[]> {
    const bucket = [];

    for (const value of gen) {
        bucket.push(value);

        if (bucket.length >= size) {
            yield bucket;

            bucket.splice(0, bucket.length);
        }
    }

    if (bucket.length !== 0) {
        yield bucket;

        bucket.splice(0, bucket.length);
    }
}

export async function* toAsyncBucket<T>(gen: AsyncGenerator<T>, size: number): AsyncGenerator<T[]> {
    const bucket = [];

    for await (const value of gen) {
        bucket.push(value);

        if (bucket.length >= size) {
            yield bucket;

            bucket.splice(0, bucket.length);
        }
    }

    if (bucket.length !== 0) {
        yield bucket;

        bucket.splice(0, bucket.length);
    }
}

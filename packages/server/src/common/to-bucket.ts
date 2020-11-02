
export default async function* toBucket<T>(gen: AsyncGenerator<T>, size: number)
    : AsyncGenerator<T[]> {
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

export type Query = {
    query: QueryItem[]
}

export type QueryItem =
    { name: string | RegExp }
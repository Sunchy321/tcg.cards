export type SearchResult = {
    text:    string;
    // queries: RawQuery[];
    errors:  { type: string, value?: string, query?: string }[];
    result?: any;
};

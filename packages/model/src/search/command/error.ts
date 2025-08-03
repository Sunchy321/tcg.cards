export class QueryError extends Error {
    type:     string;
    payload?: any;

    constructor(arg: { type: string, payload?: any }) {
        super();

        this.type = arg.type;
        this.payload = arg.payload;
    }
}

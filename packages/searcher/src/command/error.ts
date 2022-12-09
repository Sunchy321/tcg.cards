export class QueryError extends Error {
    type: string;
    value?: any;

    constructor(arg: { type: string, value?: any }) {
        super();

        this.type = arg.type;
        this.value = arg.value;
    }
}

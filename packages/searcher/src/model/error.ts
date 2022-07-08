export default class SearchError extends Error {
    type: string;
    value: any;
    location: [number, number];

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    constructor(type: string, value: any, location: [number, number]) {
        super(value != null ? `${type}: ${value}` : type);

        this.type = type;
        this.value = value;
        this.location = location;
    }
}

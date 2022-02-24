export type Log = LogItem[];

export type LogItem = UnknownItem;

export type UnknownItem = {
    type: 'unknown';
    date: string;
    text: string;
};

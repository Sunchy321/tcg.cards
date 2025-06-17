export type FAQContent = any;

export interface FAQ {
    cid:          number;
    databaseDate: string;
    FAQ:          FAQContent;
    pendulumFAQ:  FAQContent;
    listedQAs:    number[];
}

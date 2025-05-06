export interface Card {
    cid:     number;
    id:      number;
    cn_name: string;
    sc_name: string;
    md_name: string;
    nwbbs_n: string;
    cnocg_n: string;
    jp_ruby: string;
    jp_name: string;
    en_name: string;
    text: {
        types: string;
        pdesc: string;
        desc:  string;
    };
    data: {
        ot:        number;
        setcode:   number;
        type:      number;
        atk:       number;
        def:       number;
        level:     number;
        race:      number;
        attribute: number;
    };
}
export type File = Record<string, Card>;

declare module 'ssl-root-cas' {
    type CAS = string & {
        addFile: (filepath: string) => void;
    };

    export function create(): CAS;
}

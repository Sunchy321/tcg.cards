export interface Patch {
    version:   string;
    shortName: string;
    number:    number;
    hash:      string;
    isCurrent: boolean;
    isUpdated: boolean;
}

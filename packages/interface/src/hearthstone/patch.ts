export interface Patch {
    buildNumber: number;
    name:        string;
    shortName:   string;
    hash:        string;
    isCurrent:   boolean;
    isUpdated:   boolean;
}

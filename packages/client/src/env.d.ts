declare namespace NodeJS {
    interface ProcessEnv {
        DEV: boolean;
        PROD: boolean;
        DEBUGGING: boolean;
        CLIENT: boolean;
        SERVER: boolean;
        NODE_ENV: string;
        VUE_ROUTER_MODE: 'abstract' | 'hash' | 'history' | undefined;
        VUE_ROUTER_BASE: string | undefined;
    }
}

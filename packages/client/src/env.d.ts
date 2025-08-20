/// <reference types="vite/client" />

declare namespace NodeJS {
    interface ProcessEnv {
        DEV:             boolean;
        PROD:            boolean;
        DEBUGGING:       boolean;
        CLIENT:          boolean;
        SERVER:          boolean;
        NODE_ENV:        string;
        VUE_ROUTER_MODE: 'abstract' | 'hash' | 'history' | undefined;
        VUE_ROUTER_BASE: string | undefined;
    }
}

interface ImportMetaEnv {
    readonly VITE_HONO_URL: string;
    readonly VITE_TRPC_URL: string;
    readonly VITE_AUTH_URL: string;
    readonly VITE_SSE_URL:  string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

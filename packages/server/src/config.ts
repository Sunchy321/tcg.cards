import { readFileSync } from 'fs';

import { AxiosProxyConfig } from 'axios';

const configPath = process.argv[2];

export interface Database {
    user: string;
    password: string;
}

export interface MongoDB {
    host: string;

    database: Record<string, Database>;
}

export interface HttpsSecret {
    key: string;
    cert: string;
}

export interface Config {
    appKey: string;
    jwtSecretKey: string;

    httpsSecret: {
        default: HttpsSecret;
        api: HttpsSecret;
        image: HttpsSecret;
        user: HttpsSecret;
        control: HttpsSecret;
    };

    client: string;
    asset: string;
    data: string;
    log: string;
    internalData?: string;

    axiosProxy?: AxiosProxyConfig;

    mongodb: MongoDB;

    hearthstone: {
        blizzard: {
            clientId: string;
            clientSecret: string;
        };
    };
}

export const config = JSON.parse(readFileSync(configPath).toString()) as Config;

export const { mongodb, hearthstone, httpsSecret } = config;

export const clientPath = config.client;
export const assetPath = config.asset;
export const logPath = config.log;
export const dataPath = config.data;
export const internalDataPath = config.internalData;

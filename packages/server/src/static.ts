import { readFileSync } from 'fs';

const configPath = process.env.NODE_ENV === 'production' ? process.argv[2] : './config.json';

export interface Database {
    user: string;
    password: string;
}

export interface MongoDB {
    host: string;

    database: Record<string, Database>
}

export interface Config {
    appKey: string;
    jwtSecretKey: string;

    client: string;
    asset: string;
    data: string;
    log: string;

    mongodb: MongoDB,

    hearthstone: {
        blizzard: {
            clientId: string;
            clientSecret: string;
        }
    }
}

export const config = JSON.parse(readFileSync(configPath).toString()) as Config;

export const mongodb = config.mongodb;

export const clientPath = config.client;
export const assetPath = config.asset;
export const logPath = config.log;
export const dataPath = config.data;

export const hearthstone = config.hearthstone;

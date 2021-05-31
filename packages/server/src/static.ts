import { readFileSync } from 'fs';
import { join } from 'path';

const configPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, process.argv[2])
    : join(__dirname, '../config.json');

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

    mongodb: MongoDB
}

export const config = JSON.parse(readFileSync(configPath).toString()) as Config;

export const mongodb = config.mongodb;

export const clientPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.client)
    : join(__dirname, '..', config.client);

export const assetPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.asset)
    : join(__dirname, '..', config.asset);

export const logPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.log)
    : join(__dirname, '..', config.log);

export const dataPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.data)
    : join(__dirname, '..', config.data);

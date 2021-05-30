import { readFileSync } from 'fs';
import { join } from 'path';

const configPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, 'config.json')
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

    asset: string;
    data: string;
    log: string;

    mongodb: MongoDB
}

export const config = JSON.parse(readFileSync(configPath).toString()) as Config;

export const mongodb = config.mongodb;

export const publicPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, 'public/dist')
    : join(__dirname, '../public/dist');

export const assetPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.asset)
    : join(__dirname, '..', config.asset);

export const logPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.log)
    : join(__dirname, '..', config.log);

export const dataPath = process.env.NODE_ENV === 'production'
    ? join(__dirname, config.data)
    : join(__dirname, '..', config.data);

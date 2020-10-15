/* eslint-disable camelcase */

import { Progress } from 'request-progress';

export type UUID = string;
export type URI = string;
export type Timestamp = string;
export type MimeType = string;
export type Encoding = string;

export interface BulkData {
    object: 'bulk_data';
    id: UUID;
    type: string;
    name: string;
    description: string;
    download_uri: string;
    updated_at: Timestamp;
    compressed_size: number;
    content_type: MimeType;
    content_encoding: Encoding;
}

export interface BulkProgress extends Progress {
    type: 'all-card' | 'ruling';
}

export interface BulkList {
    allCard: string[];
    ruling: string[];
}

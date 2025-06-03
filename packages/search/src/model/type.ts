import { Aggregate } from 'mongoose';

export type PostAction = {
    phase:  string;
    action: (agg: Aggregate<any>) => void;
};

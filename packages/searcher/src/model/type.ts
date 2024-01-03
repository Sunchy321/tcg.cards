import { BackendCommand } from '../command/backend';
import { Operator, Qualifier } from '../command';
import { Aggregate } from 'mongoose';

export type AnyBackendCommand =
    BackendCommand<any, Operator, Qualifier, boolean, any> |
    BackendCommand<any, Operator, Qualifier, boolean, never>;

export type PostAction = {
    phase: string;
    action: (agg: Aggregate<any>) => void;
};

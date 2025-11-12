import { hsdataTrpc } from './data/hsdata';
import { apolloTrpc } from './data/apollo';

export const dataTrpc = {
    apollo: apolloTrpc,
    hsdata: hsdataTrpc,
};

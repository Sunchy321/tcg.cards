import {
  createHsdataTrpc,
  type CreateHsdataTrpcOptions,
} from './hsdata';

export * from './hsdata';

export function createDataSourceTrpc(options: CreateHsdataTrpcOptions) {
  return {
    hsdata: createHsdataTrpc(options),
  };
}

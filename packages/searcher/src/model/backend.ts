import { BackendCommand } from '../command/backend';

type BackendModelOption = {
    commands: BackendCommand<any, any, any, any, any>[];
};

export class BackendModel {
    commands: BackendCommand<any, any, any, any, any>[] = [];

    constructor(option: BackendModelOption) {
        this.commands = option.commands;
    }
}

export function defineBackendModel(option: BackendModelOption): BackendModel {
    return new BackendModel(option);
}

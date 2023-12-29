import { Command } from '../command';

type ModelOption = {
    commands: Command<any, any, any, any, any>[];
};

export class Model {
    commands: Command<any, any, any, any, any>[] = [];

    constructor(option: ModelOption) {
        this.commands = option.commands;
    }
}

export function defineModel(option: ModelOption): Model {
    return new Model(option);
}

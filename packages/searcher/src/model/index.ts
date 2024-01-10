import { CommonCommand } from '../command';

type ModelOption = {
    commands: CommonCommand[];
};

export class Model {
    commands: CommonCommand[] = [];

    constructor(option: ModelOption) {
        this.commands = option.commands;
    }
}

export function defineModel(option: ModelOption): Model {
    return new Model(option);
}

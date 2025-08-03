import { CommonCommand } from './command';

type ModelOption = {
    id: string;

    commands: CommonCommand[];
};

export class Model {
    id: string;

    commands: CommonCommand[] = [];

    constructor(option: ModelOption) {
        this.id = option.id;
        this.commands = option.commands;
    }
}

export function defineModel(option: ModelOption): Model {
    return new Model(option);
}

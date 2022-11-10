export type CommandType =  'text' | 'number' | 'enum' | CommandType[] | 'numberlike';

export type Command = {
    id: string;
    alt?: string[];
    type?: CommandType
}

export type Model = {
    game: string;
    commands: Command[]
}
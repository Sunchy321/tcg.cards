import { all } from '@search/command/builtin/all';

export const cost = all
    .$type('magic:cost')
    .$meta({ allowFloat: false });

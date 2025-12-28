import { all } from '@search/common/command/builtin/all';

export const cost = all
    .$type('magic:cost')
    .$meta({ allowFloat: false });

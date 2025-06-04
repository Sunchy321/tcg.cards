import { defineModel } from '../../src/model';
import { defineCommand } from '../../src/command';

import * as builtin from '../../src/command/builtin';

const raw = defineCommand({ id: '', operators: [''], allowRegex: true });

const name = builtin.text({ id: 'name', alt: ['n'] });
const type = builtin.text({ id: 'type', alt: ['t'] });
const text = builtin.text({ id: 'text', alt: ['x'] });

const order = defineCommand({
    id:        'order',
    operators: [':'],
});

export const commands = {
    raw,
    name,
    type,
    text,
    order,
};

export default defineModel({
    id:       'lorcana',
    commands: Object.values(commands),
});

import { defineModel } from '@search/model';
import { defineCommand } from '@search/command';

import * as builtin from '@search/command/builtin';

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
    id:       'omnisearch',
    commands: Object.values(commands),
});

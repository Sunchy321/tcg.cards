import { useFormat } from '@/common/router/format';

import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/lorcana/schema/format';
import { formatChange } from '@model/lorcana/schema/game-change';

import { formats as formatStaticList } from '@model/lorcana/schema/basic';

const { list, full, changes } = useFormat('lorcana', {
    table:  { Format, FormatChange },
    schema: { format, formatChange },
    formatStaticList,
});

export const formatTrpc = {
    list,
    full,
    changes,
};

export const formatApi = {
    list,
    '': full,
    changes,
};

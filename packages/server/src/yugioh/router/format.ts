import { useFormat } from '@/common/router/format';

import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/magic/schema/format';
import { formatChange } from '@model/magic/schema/game-change';

import { formats as formatStaticList } from '@model/yugioh/schema/basic';

const { list, full, changes } = useFormat('yugioh', {
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

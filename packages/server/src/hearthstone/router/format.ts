import { useFormat } from '@/common/router/format';

import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/hearthstone/schema/format';
import { formatChange } from '@model/hearthstone/schema/game-change';

import { formats as formatStaticList } from '@static/hearthstone/basic';

const { list, full, changes } = useFormat('hearthstone', {
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

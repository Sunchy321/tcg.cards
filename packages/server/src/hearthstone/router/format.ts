import { useFormat } from '@/common/router/format';

import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/hearthstone/schema/format';
import { formatChange } from '@model/hearthstone/schema/game-change';

import { formats as formatStaticList } from '@model/hearthstone/schema/basic';

const { list, full, save, changes } = useFormat('hearthstone', {
    table:  { Format, FormatChange },
    schema: { format, formatChange },
    formatStaticList,
});

export const formatTrpc = {
    list,
    full,
    save,
    changes,
};

export const formatApi = {
    list,
    '': full,
    save,
    changes,
};

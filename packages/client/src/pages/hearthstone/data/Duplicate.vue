<template>
    <div class="q-ma-md">
        <div class="row items-center q-mb-md">
            <span>{{ total }}</span>
            <q-btn class="q-ml-md" outline dense @click="resolveDuplicate">Resolve</q-btn>
            <q-btn class="q-ml-md" outline dense @click="mergeData">Merge</q-btn>
            <q-btn class="q-ml-md" outline dense @click="rotateData">Rotate</q-btn>

            <span style="width: 30px" />

            <q-btn class="q-ml-sm" outline dense rounded color="primary" @click="guessResolve">Guess</q-btn>
            <q-btn class="q-ml-sm" outline dense rounded color="primary" @click="tryMerge">Try Merge</q-btn>
        </div>

        <JsonComparator :values="values" :key-order="keyOrder" @update-value="updateValue">
            <template #default="{text, value, index, which}">
                <template v-if="index[index.length - 1] == '.cardId'">
                    cardId:
                    <defer-input
                        class="cardid-input"
                        flat dense outlined
                        :model-value="value"
                        @update:model-value="value => updateValue({
                            index,
                            value: toIdentifier(value as string),
                            which
                        })"
                    />
                </template>
                <span v-else>{{ text }}</span>
            </template>
        </JsonComparator>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Notify } from 'quasar';

import controlSetup from 'setup/control';

import JsonComparator from 'components/JSONComparator.vue';
import DeferInput from 'src/components/DeferInput.vue';

import type { Card } from 'interface/hearthstone/card';

import {
    isEqual, set, uniq, flatten, omit, deburr, cloneDeep,
} from 'lodash';

import recursive from 'common/document/recursive';
import compare, { allEqual } from 'common/document/compare';
import assign from 'common/document/assign';

export type ICardUpdation = {
    cardId: string;
    scryfallId: string;
    key: string;
    partIndex?: number;
    oldValue: any;
    newValue: any;

    set: string;
    number: string;
    lang: string;
};

type DuplicateData = {
    total: number;
    values: Card[];
    initial: { cardId: string, version: number };
};

const { controlGet, controlPost } = controlSetup();

const data = ref<DuplicateData>({
    total:   0,
    values:  [],
    initial: { cardId: '', version: 0 },
});

const total = computed(() => data.value.total);
const initial = computed(() => data.value.initial);

const values = computed({
    get() { return data.value.values; },
    set(newValue) {
        data.value.values = newValue;
    },
});

const loadData = async () => {
    const { data: result } = await controlGet<DuplicateData>('/hearthstone/card/get-duplicate');

    data.value = result;
};

onMounted(loadData);

const resolveDuplicate = async () => {
    await controlPost('/hearthstone/card/resolve-duplicate', {
        data:    values.value,
        initial: initial.value,
    });

    await loadData();
};

const keyOrder = (key: string, allValues: any[], index: string[]) => {
    if (index.length === 0) {
        switch (key) {
        case 'cardId':
            return 999;
        case 'type':
            return 998;
        default:
            return null;
        }
    } else {
        return null;
    }
};

const toIdentifier = (text: string) => deburr(text)
    .trim()
    .toLowerCase()
    .replace(' // ', '____')
    .replace('/', '____')
    .replace(/[^a-z0-9!:]/g, '_');

const updateValue = ({ index, value, which }: { index: string[], value: any, which?: number }) => {
    if (index.length === 0) {
        if (which != null) {
            values.value[which] = value;
        } else {
            for (const [i] of values.value.entries()) {
                values.value[i] = value;
            }
        }
    } else {
        const path = index.map(v => (v.startsWith('.') ? v.slice(1) : v.slice(1, -1)));

        if (which != null) {
            set(values.value[which], path, value);
        } else {
            for (const v of values.value) {
                set(v, path, value);
            }
        }
    }
};

const omitKey = ['version', 'set', 'entityId'];

const mergeData = () => {
    const allVersion = uniq(flatten(values.value.map(v => v.version)));
    const commonVersion = allVersion.filter(v => values.value.every(o => o.version.includes(v)));

    for (const [i, v] of values.value.entries()) {
        v.relatedEntities = v.relatedEntities.filter(r => r.relation !== 'count_as_copy_of');

        if (i !== 0) {
            const thisJson = omit(v, omitKey);
            const lastJson = omit(values.value[i - 1], omitKey);

            if (!isEqual(thisJson, lastJson)) {
                Notify.create({
                    message: `Card [${i}] is not equal to previous card`,
                    color:   'negative',
                });

                const duplicates = Object.keys((thisJson as any).localization)
                    .filter(k => !isEqual((thisJson.localization as any)[k], (lastJson.localization as any)[k]))
                    .map(k => ({
                        key:  k,
                        this: (thisJson.localization as any)[k],
                        last: (lastJson.localization as any)[k],
                    }));

                (window as any).duplicates = duplicates;
                console.log(duplicates);

                return;
            }
        }
    }

    const targetVersion = commonVersion.length > 0 ? commonVersion : allVersion;

    const commonJson = {
        ...omit(values.value[0], omitKey),
        version:  targetVersion,
        set:      uniq(flatten(values.value.map(v => v.set))),
        entityId: uniq(flatten(values.value.map(v => v.entityId))),
    } as Card;

    const remainingJson = values.value.map(v => ({
        ...v,
        version: v.version.filter(o => !targetVersion.includes(o)),
    }) as Card).filter(v => v.version.length > 0);

    data.value.values = [...remainingJson, commonJson];
};

const rotateData = () => {
    values.value = [...values.value.slice(1), values.value[0]];
};

const guessResolve = () => {
    const cards = values.value;

    const resolved = () => uniq(cards.map(c => c.cardId)).length === cards.length;

    // battlegrounds
    for (const c of cards) {
        const tester = [/^TB_Bacon[Uu]ps/];

        if (tester.some(t => t.test(c.entityId[0]))) {
            c.cardId += ':golden';
        }
    }

    if (resolved()) {
        return;
    }

    // Hero
    if (cards.some(v => v.type === 'hero') && cards.some(v => v.type !== 'hero')) {
        for (const c of cards) {
            if (c.type === 'hero') {
                c.cardId += '!hero';
            }
        }
    }

    if (resolved()) {
        return;
    }

    // Hero power
    if (cards.some(v => v.type === 'hero_power') && cards.some(v => v.type !== 'hero_power')) {
        for (const c of cards) {
            if (c.type === 'hero_power') {
                c.cardId += '!hero_power';
            }
        }
    }

    if (resolved()) {
        return;
    }

    // duel
    for (const c of cards) {
        const tester = [/^PVPDR/];

        if (tester.some(t => t.test(c.entityId[0]))) {
            c.cardId += ':duel';
        }
    }

    if (resolved()) {
        return;
    }

    // Tavern Brawl & Wild Return
    for (const c of cards) {
        if (c.set.includes('tb')) {
            if (['FB_Champs', 'TB_Champs'].some(p => c.entityId[0].startsWith(p))) {
                c.cardId += ':hall_of_champions';
            } else {
                c.cardId += ':tavern_brawl';
            }
        }
    }

    if (resolved()) {
        return;
    }

    // Heroic
    if (cards.length === 2) {
        const mainId = cards.map(c => c.entityId[0]).sort((a, b) => a.length - b.length)[0];

        const possibleId = ['h', 'x', '_H'].map(s => mainId + s);

        possibleId.push(`${mainId.slice(0, -1)}x${mainId.slice(-1)}`);

        for (const c of cards) {
            if (c.entityId[0] !== mainId && possibleId.includes(c.entityId[0])) {
                c.cardId += ':heroic';
            }
        }

        if (resolved()) {
            return;
        }
    }

    // Keywords
    if (cards.length === 2) {
        if (cards.some(c => c.mechanics.includes('twinspell'))) {
            for (const c of cards) {
                if (!c.mechanics.includes('twinspell')) {
                    c.cardId += '!twinspell';
                }
            }
        }
    }

    if (resolved()) {
        return;
    }

    // Storybook
    for (const c of cards) {
        const tester = [/^Story/];

        if (tester.some(t => t.test(c.entityId[0]))) {
            c.cardId += ':story';
        }
    }
};

const tryMerge = () => {
    const newValues = cloneDeep(values.value);

    recursive(
        values.value,
        (itemValues, index) => {
            if (itemValues.some(v => !isEqual(v, itemValues[0]))) {
                const realValue = itemValues.filter(v => v != null);

                if (realValue.length === 1) {
                    newValues.forEach(v => { assign(v, index, realValue[0]); });
                    return;
                }

                // Battlegrounds
                if (values.value.length === 2 && values.value.some(v => v.set.includes('bgs'))) {
                    if (['.collectible', '.inBobsTavern'].includes(index[0])) {
                        if (itemValues.includes(true) && itemValues.includes(false)) {
                            newValues.forEach(v => { assign(v, index, true); });
                            return;
                        }
                    }
                }

                // Wild Return
                if (index[0] === '.mechanics') {
                    const filtered = itemValues.map(v => v.filter((m: string) => m !== '?unknown_858'));

                    console.log('MECH: ', filtered, allEqual(filtered));

                    if (allEqual(filtered)) {
                        newValues.forEach(v => { assign(v, index, filtered[0]); });
                        return;
                    }
                }

                if (itemValues.every(v => typeof v === 'string')) {
                    const splitted = itemValues.map(v => v.split(''));

                    const diff = compare(splitted, false);

                    console.log('DIFF: ', index.join(''));
                    console.dir(diff.map(d => [d[0], itemValues.map(v => v[d[0].slice(1, -1) as unknown as number])]));
                } else {
                    console.log('DIFF: ', index.join(''));
                    console.dir(itemValues);
                }
            }
        },
    );

    values.value = newValues;
};
</script>

<style lang="sass" scoped>
.cardid-input
    flex-basis: 300px

</style>

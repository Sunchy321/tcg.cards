<template>
    <q-page class="main row justify-center items-start q-pa-md">
        <div class="flex items-center">
            <span class="item-name">{{ $t('magic.ui.advanced-search.name') }}</span>
            <q-input v-model="name" class="col-grow" outlined dense clearable />
        </div>

        <div class="flex items-center">
            <span class="item-name">{{ $t('magic.ui.advanced-search.cost') }}</span>
            <q-select
                v-model="costType" :options="selectOptions"
                outlined dense
                emit-value map-options
            />
            <span class="q-mx-sm">
                <magic-symbol
                    v-for="(c, i) in cost" :key="i"
                    :value="c"
                    @click="() => removeCost(i)"
                />
            </span>
            <q-input
                v-model="costInput"
                class="col-grow"
                outlined dense clearable
                @keypress.enter="newCost"
            />
        </div>

        <div class="flex no-wrap items-center">
            <span class="item-name">{{ $t('magic.ui.advanced-search.type') }}</span>
            <div class="col-grow flex items-center q-gutter-sm">
                <span
                    v-for="(t, i) in types" :key="i"
                    class="type"
                    :class="t.include ? 'include' : 'exclude'"
                >
                    <q-btn
                        :icon="typeIcon(i)"
                        flat dense round
                        @click="() => switchType(i)"
                    />
                    {{ t.value }}
                    <q-btn
                        icon="mdi-close-circle"
                        flat dense round
                        @click="() => removeType(i)"
                    />
                </span>
                <q-input
                    v-model="typeInput"
                    class="col-grow"
                    outlined dense clearable
                    @keypress.enter="newType"
                />
            </div>
        </div>

        <div class="flex items-center">
            <span class="item-name">{{ $t('magic.ui.advanced-search.text') }}</span>
            <q-input v-model="text" class="col-grow" outlined dense clearable />
        </div>

        <div class="flex items-center">
            <span class="item-name"> {{ $t('magic.ui.advanced-search.color') }}</span>
            <q-select
                v-model="colorType" :options="selectOptions"
                outlined dense
                emit-value map-options
            />
            <q-checkbox
                v-for="c in ['W','U','B','R','G']" :key="c"
                :model-value="colors != null && colors.includes(c)"
                @update:model-value="v => checkColor(c, v)"
            >
                <div class="flex items-center">
                    <magic-symbol class="magic-symbol" :value="c" />
                </div>
            </q-checkbox>

            <q-checkbox
                :model-value="colors != null && colors.length === 0"
                @update:model-value="v => checkColor('C', v)"
            >
                <div class="flex items-center">
                    <magic-symbol class="magic-symbol" value="C" />
                </div>
            </q-checkbox>
        </div>

        <div class="flex items-center">
            <span class="item-name"> {{ $t('magic.ui.advanced-search.color-identity') }}</span>
            <q-select
                v-model="colorIdentityType" :options="selectOptions"
                outlined dense
                emit-value map-options
            />
            <q-checkbox
                v-for="c in ['W','U','B','R','G']" :key="c"
                :model-value="colorIdentities != null && colorIdentities.includes(c)"
                @update:model-value="v => checkColorIdentity(c, v)"
            >
                <div class="flex items-center">
                    <magic-symbol class="magic-symbol" :value="c" />
                </div>
            </q-checkbox>

            <q-checkbox
                :model-value="colorIdentities != null && colorIdentities.length === 0"
                @update:model-value="v => checkColorIdentity('C', v)"
            >
                <div class="flex items-center">
                    <magic-symbol class="magic-symbol" value="C" />
                </div>
            </q-checkbox>
        </div>

        <q-btn
            icon="mdi-magnify"
            :label="$t('magic.ui.advanced-search.search')"
            outline dense
            @click="doSearch"
        />
    </q-page>
</template>

<style lang="sass" scoped>
.item-name
    margin-right: 8px
    flex-shrink: 0

.main
    max-width: 1000px
    margin: 0 auto

    & > *
        flex-basis: 100%
        margin-bottom: 8px

.magic-symbol
    font-size: 18px

.type
    border: 1px black solid
    border-radius: 5px

    &.include
        color: $positive
        border-color: $positive

    &.exclude
        color: $negative
        border-color: $negative
</style>

<script lang="ts">
import { Ref, defineComponent, ref } from 'vue';

import pageSetup from 'setup/page';

import { useRouter } from 'vue-router';
import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import MagicSymbol from 'components/magic/Symbol.vue';

type SelectType = 'include' | 'exact' | 'at-most'

export default defineComponent({
    components: { MagicSymbol },

    setup() {
        const router = useRouter();
        const store = useStore();
        const i18n = useI18n();

        pageSetup({
            title: () => i18n.t('magic.ui.advanced-search.$self'),
        });

        const selectOptions = ['include', 'exact', 'at-most'].map(v => ({
            value: v,
            label: i18n.t('magic.ui.advanced-search.color-option.' + v),
        }));

        const name = ref('');
        const cost = ref<string[]>([]);
        const types = ref<{ include: boolean, value: string }[]>([]);
        const text = ref('');

        const costType = ref<SelectType>('include');
        const costInput = ref('');

        const newCost = () => {
            if (costInput.value !== '') {
                const symbols = store.getters['magic/data'].symbols;

                const values = costInput.value
                    .toUpperCase()
                    .split(/\{([^{}]*)\}|(\d{2,})|(.(?:\/.)?)/)
                    .filter(v => v !== '' && v != null);

                const valuesInSymbol = values.filter(v => symbols.includes(v));

                if (valuesInSymbol.length > 0) {
                    cost.value.push(...valuesInSymbol);

                    costInput.value = '';
                }
            }
        };

        const removeCost = (index: number) => cost.value.splice(index, 1);

        const typeInput = ref('');

        const newType = () => {
            if (typeInput.value !== '') {
                types.value.push({
                    include: true,
                    value:   typeInput.value,
                });

                typeInput.value = '';
            }
        };

        const typeIcon = (index: number) => {
            if (types.value[index].include) {
                return 'mdi-check';
            } else {
                return 'mdi-close';
            }
        };

        const removeType = (index: number) => types.value.splice(index, 1);

        const switchType = (index: number) => {
            if (types.value[index] != null) {
                types.value[index].include = !types.value[index].include;
            }
        };

        // ref.value:
        //     null -> no query
        //     [] -> colorless
        //     [A, B] -> with color
        const colorChecker = (ref: Ref<string[]|null>) => (color: string, value: boolean) => {
            if (color === 'C') {
                if (value) {
                    ref.value = [];
                } else {
                    ref.value = null;
                }
            } else {
                if (value) {
                    if (ref.value == null) {
                        ref.value = [color];
                    } else if (!ref.value.includes(color)) {
                        ref.value = ['W', 'U', 'B', 'R', 'G'].filter(
                            c => ref.value!.includes(c) || color === c,
                        );
                    }
                } else {
                    if (ref.value != null) {
                        const value = ref.value.filter(c => c !== color);

                        ref.value = value.length === 0 ? null : value;
                    }
                }
            }
        };

        const colorType = ref<SelectType>('include');
        const colors = ref<string[]|null>(null);
        const checkColor = colorChecker(colors);

        const colorIdentityType = ref<SelectType>('include');
        const colorIdentities = ref<string[]|null>(null);
        const checkColorIdentity = colorChecker(colorIdentities);

        const addQuestionMark = (text: string) => {
            if (text.startsWith('/') && text.endsWith('/')) {
                return text;
            }

            if (text.includes(' ')) {
                if (text.includes('"')) {
                    return `'${text.replace(/'/g, '\\\'')}'`;
                } else {
                    return `"${text}"`;
                }
            }

            return text;
        };

        const doSearch = () => {
            newCost();
            newType();

            let query = '';

            if (name.value !== '') {
                query += ` n:${addQuestionMark(name.value)}`;
            }

            if (cost.value.length > 0) {
                const costQuery = cost.value.map(v => `{${v}}`).join('');

                switch (costType.value) {
                case 'include':
                    query += ` m:${costQuery}`;
                    break;
                case 'exact':
                    query += ` m=${costQuery}`;
                    break;
                case 'at-most':
                    query += ` m<=${costQuery}`;
                }
            }

            for (const type of types.value) {
                if (type.include) {
                    query += ` t:${addQuestionMark(type.value)}`;
                } else {
                    query += ` t!:${addQuestionMark(type.value)}`;
                }
            }

            if (colors.value != null) {
                const q = colors.value.length === 0 ? 'C' : colors.value.join('');

                switch (colorType.value) {
                case 'include':
                    query += ` c:${q}`;
                    break;
                case 'exact':
                    query += ` c=${q}`;
                    break;
                case 'at-most':
                    query += ` c<=${q}`;
                }
            }

            if (colorIdentities.value != null) {
                const q = colorIdentities.value.length === 0 ? 'C' : colorIdentities.value.join('');

                switch (colorIdentityType.value) {
                case 'include':
                    query += ` cd:${q}`;
                    break;
                case 'exact':
                    query += ` cd=${q}`;
                    break;
                case 'at-most':
                    query += ` cd<=${q}`;
                }
            }

            if (text.value !== '') {
                query += ` x:${addQuestionMark(text.value)}`;
            }

            if (query === '') {
                return;
            }

            void router.push({
                name: 'magic/search',

                query: { q: query.trim() },
            });
        };

        return {
            name,
            types,
            text,

            cost,
            costType,
            costInput,
            newCost,
            removeCost,

            typeInput,
            typeIcon,
            newType,
            removeType,
            switchType,

            selectOptions,
            colors,
            colorType,
            checkColor,
            colorIdentities,
            colorIdentityType,
            checkColorIdentity,

            doSearch,
        };
    },
});
</script>

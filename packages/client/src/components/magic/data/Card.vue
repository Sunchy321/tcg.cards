<template>
    <div class="q-pa-md row">
        <div class="card-image col-3 q-mr-md">
            <q-img :src="imageUrl" :ratio="745/1040" native-context-menu :class="{ rotate }">
                <template v-slot:error>
                    <div class="card-not-found">
                        <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                    </div>
                </template>
            </q-img>
        </div>
        <div class="col">
            <div class="q-mb-md">
                <q-input v-model="search" class="q-mr-md" dense @keypress.enter="doSearch">
                    <template v-slot:append>
                        <q-btn
                            icon="mdi-magnify"
                            flat dense round
                            @click="doSearch"
                        />
                    </template>
                </q-input>
            </div>
            <div class="q-mb-md">
                <q-btn-group outline>
                    <q-btn outline label="oracle" @click="loadData('inconsistent-oracle')" />
                    <q-btn outline label="unified" @click="loadData('inconsistent-unified')" />
                    <q-btn outline label="paren" @click="loadData('parentheses')" />
                    <q-btn outline label="token" @click="loadData('token')" />
                </q-btn-group>

                <span v-if="total != null" class="q-ml-md">{{ total }}
                </span>

                <q-btn
                    class="q-mx-md"
                    outline
                    label="prettify"
                    @click="prettify"
                />

                <q-input v-model="replaceFrom" class="inline-flex" dense />
                <q-icon name="mdi-arrow-right" class="q-mx-md" />
                <q-input v-model="replaceTo" class="inline-flex" dense />
            </div>

            <div class="id-line row items-center">
                <q-input
                    v-if="unlock"
                    v-model="id"
                    class="id code"
                    dense outlined
                />

                <div v-else class="id code">
                    {{ id }}
                </div>

                <div class="info q-mx-md">
                    {{ info }}
                </div>

                <q-btn-toggle
                    v-model="partIndex"
                    :options="partOptions"
                    outline dense
                />

                <div class="col-grow" />

                <q-btn
                    :icon="unlock ? 'mdi-lock-open' : 'mdi-lock'"
                    dense flat round
                    @click="unlock = !unlock"
                />

                <q-btn
                    icon="mdi-upload"
                    dense flat round
                    @click="update"
                />
            </div>

            <table>
                <tr>
                    <td class="title">
                        Oracle
                    </td>
                    <td class="name">
                        <q-input v-if="unlock" v-model="oracleName" outlined type="textarea" dense />
                        <div v-else>
                            {{ oracleName }}
                        </div>
                    </td>
                    <td class="typeline">
                        <q-input v-if="unlock" v-model="oracleTypeline" outlined type="textarea" dense />
                        <div v-else>
                            {{ oracleTypeline }}
                        </div>
                    </td>
                    <td class="text">
                        <q-input v-if="unlock" v-model="oracleText" outlined type="textarea" dense />
                        <div v-else>
                            <div v-for="(t, i) in (oracleText || '').split('\n')" :key="i">
                                {{ t }}
                            </div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td class="title">
                        Unified
                    </td>
                    <td class="name">
                        <q-input v-model="unifiedName" outlined dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="unifiedTypeline" outlined dense />
                    </td>
                    <td class="text">
                        <q-input v-model="unifiedText" outlined type="textarea" dense />
                    </td>
                </tr>
                <tr>
                    <td class="title">
                        Printed
                    </td>
                    <td class="name">
                        <q-input v-model="printedName" outlined dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="printedTypeline" outlined dense />
                    </td>
                    <td class="text">
                        <q-input v-model="printedText" outlined type="textarea" dense />
                    </td>
                </tr>
            </table>

            <q-input v-model="flavor" label="Flavor" outlined type="textarea" />

            <q-input
                v-model="relatedCards"
                debounce="500"
                label="Related Cards"
                outlined dense
            />
        </div>
    </div>
</template>

<style lang="stylus" scoped>
.inline-flex
    display inline-flex

.card-not-found
    width 100%
    background-color transparent !important
    padding 0 !important

.q-input.id
    width 300px

table
    width 100%

    & .title
        width 50px

    & .name
        width 150px

    & .typeline
        width 250px

.rotate
    transform rotate(90deg) scale(745/1040)

@media screen and (max-width: 1000px)
    .card-image
        display none

</style>

<script>
import { escapeRegExp } from 'lodash';

import routeComputed from 'src/route-computed';

import { imageBase } from 'boot/backend';

function field(firstKey, lastKey, defaultValue) {
    if (lastKey != null) {
        return {
            get() { return this.part?.[firstKey]?.[lastKey] ?? defaultValue; },
            set(newValue) {
                if (this.data != null) {
                    this.data.parts[this.partIndex][firstKey][lastKey] = newValue;
                }
            },
        };
    } else {
        return {
            get() { return this.part?.[firstKey] ?? defaultValue; },
            set(newValue) {
                if (this.data != null) {
                    this.$set(this.part, firstKey, newValue);
                }
            },
        };
    }
}

export default {
    name: 'DataCard',

    data: () => ({
        data:        null,
        unlock:      false,
        replaceFrom: '',
        replaceTo:   '',
    }),

    computed: {
        search: routeComputed('q', { keep: ['tab'] }),

        id: {
            get() { return this.data?.cardId ?? this.$route.query.id; },
            set(newValue) {
                if (this.data != null) {
                    this.data.cardId = newValue;
                }
            },
        },

        lang() { return this.data?.lang ?? this.$route.query.lang; },
        set() { return this.data?.setId ?? this.$route.query.set; },
        number() { return this.data?.number ?? this.$route.query.number; },

        info() {
            if (this.data) {
                return `${this.lang}, ${this.set}:${this.number}`;
            } else {
                return '';
            }
        },

        partIndex: {
            get() { return this.data?.partIndex ?? this.$route.query.part ?? 0; },
            set(newValue) {
                if (this.data != null) {
                    this.$set(this.data, 'partIndex', newValue);
                }
            },
        },

        total() { return this.data?.total; },

        layout() { return this.data?.layout; },

        rotate() { return ['split'].includes(this.layout); },

        partCount() { return this.data?.parts?.length ?? 0; },
        partOptions() {
            const result = [];

            for (let i = 0; i < this.partCount; ++i) {
                result.push({ value: i, label: i });
            }

            return result;
        },

        part() { return this.data?.parts?.[this.partIndex]; },

        oracleName:      field('oracle', 'name'),
        oracleTypeline:  field('oracle', 'typeline'),
        oracleText:      field('oracle', 'text'),
        unifiedName:     field('unified', 'name'),
        unifiedTypeline: field('unified', 'typeline'),
        unifiedText:     field('unified', 'text'),
        printedName:     field('printed', 'name'),
        printedTypeline: field('printed', 'typeline'),
        printedText:     field('printed', 'text'),

        flavor: field('flavorText', null, ''),

        relatedCards: {
            get() {
                return this.data?.relatedCards
                    ?.map(
                        ({ relation, cardId, version }) => (version != null
                            ? [relation, cardId, version.lang, version.set, version.number]
                            : [relation, cardId]
                        ).join('|')
                    )
                    ?.join(', ') ?? '';
            },
            set(newValue) {
                const parts = newValue.split(/, */);

                if (this.data != null) {
                    this.data.relatedCards = parts.map(p => {
                        const [relation, cardId, lang, set, number] = p.split('|');

                        if (lang != null) {
                            return { relation, cardId, version: { lang, set, number } };
                        } else {
                            return { relation, cardId };
                        }
                    });
                }
            },
        },

        imageUrl() {
            if (this.data == null) {
                return null;
            }

            switch (this.layout) {
            case 'transform':
            case 'modal_dfc':
            case 'double_faced_token':
                return `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}&part=${this.partIndex}`; ;
            default:
                return `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}`;
            }
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData(editType, update = true) {
            if (editType != null) {
                if (this.data != null && update) {
                    await this.update();
                }

                const { data } = await this.apiGet('/magic/card/need-edit', {
                    type: editType,
                    lang: this.$store.getters['magic/locale'],
                });

                if (data != null && data !== '') {
                    if (data.result != null) {
                        console.log(data.result);
                    }

                    this.data = data;
                } else {
                    this.data = null;
                }
            } else if (this.id && this.lang && this.set && this.number) {
                const { data } = await this.apiGet('/magic/card/raw', {
                    id:     this.id,
                    lang:   this.lang,
                    set:    this.set,
                    number: this.number,
                });

                this.data = data;
            }
        },

        async update() {
            this.defaultPrettify();

            await this.apiPost('/magic/card/update?id=' + this.id, {
                data: this.data,
            });
        },

        defaultPrettify() {
            if (this.data == null) {
                return;
            }

            if (this.lang === 'zhs' || this.lang === 'zht') {
                this.unifiedTypeline = this.unifiedTypeline.replace(/~/g, '～').replace(new RegExp('/', 'g'), '／');
                this.printedTypeline = this.printedTypeline.replace(/~/g, '～').replace(new RegExp('/', 'g'), '／');
                this.unifiedText = this.unifiedText.replace(/~/g, '～').replace(new RegExp('//', 'g'), '／');
                this.printedText = this.printedText.replace(/~/g, '～').replace(new RegExp('//', 'g'), '／');

                if (this.flavor != null) {
                    this.flavor = this.flavor.replace(/~/g, '～');
                }
            } else {
                this.unifiedTypeline = this.unifiedTypeline.replace(/ - /g, ' — ');
                this.printedTypeline = this.printedTypeline.replace(/ - /g, ' — ');
            }

            this.unifiedText = this.unifiedText.trim().replace(/[●•] ?/g, '• ');
            this.printedText = this.printedText.trim().replace(/[●•] ?/g, '• ');

            if (this.lang === 'zhs' || this.lang === 'zht') {
                if (!/[a-wyz](?![/}])/.test(this.unifiedText)) {
                    this.unifiedText = this.unifiedText
                        .replace(/(?<!•)(?<!\d-\d)(?<!\d\+) /g, '')
                        .replace(/\(/g, '（')
                        .replace(/\)/g, '）');
                }

                if (!/[a-wyz](?![/}])/.test(this.printedText)) {
                    this.printedText = this.printedText
                        .replace(/(?<!•)(?<!\d-\d)(?<!\d\+) /g, '')
                        .replace(/\(/g, '（')
                        .replace(/\)/g, '）');
                }
            }

            this.unifiedTypeline = this.unifiedTypeline.replace(/ *～ *-? */, '～');
            this.printedTypeline = this.printedTypeline.replace(/ *～ *-? */, '～');
        },

        prettify() {
            if (this.data == null) {
                return;
            }

            if (this.lang !== 'en') {
                if (
                    (this.oracleName !== this.unifiedName && this.oracleName === this.printedName) ||
                    (this.oracleTypeline !== this.unifiedTypeline && this.oracleTypeline === this.printedTypeline) ||
                    (this.oracleText !== this.unifiedText && this.oracleText === this.printedText)
                ) {
                    this.printedName = this.unifiedName;
                    this.printedTypeline = this.unifiedTypeline;
                    this.printedText = this.unifiedText;
                }
            }

            this.defaultPrettify();

            if (this.replaceFrom !== '') {
                this.unifiedText = this.unifiedText.replace(
                    new RegExp(escapeRegExp(this.replaceFrom), 'g'),
                    this.replaceTo,
                );
                this.unifiedTypeline = this.unifiedTypeline.replace(
                    new RegExp(escapeRegExp(this.replaceFrom), 'g'),
                    this.replaceTo,
                );
            }

            this.unifiedText = this.unifiedText.replace(/ *[(（][^)）]+[)）] */g, '').trim();
        },

        async doSearch() {
            if (this.data != null && this.id != null) {
                await this.update();
            }

            const { data } = await this.apiGet('/magic/search', { q: this.search, dev: '' });

            if (this.partIndex !== 0 && this.partIndex !== '0') {
                this.partIndex = 0;
            }

            this.data = data.result;
        },
    },
};
</script>

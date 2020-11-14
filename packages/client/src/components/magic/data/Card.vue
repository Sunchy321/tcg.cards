<template>
    <div class="q-pa-md row">
        <div class="col-3 q-mr-md">
            <q-img :src="imageUrl" :ratio="745/1040" native-context-menu>
                <template v-slot:error>
                    <div class="card-not-found">
                        <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                    </div>
                </template>
            </q-img>
        </div>
        <div class="col">
            <div class="special-line q-mb-md">
                <q-btn-group outline>
                    <q-btn outline label="unified" @click="loadData('inconsistent-unified')" />
                    <q-btn outline label="paren" @click="loadData('parentheses')" />
                </q-btn-group>

                <span v-if="total != null" class="q-ml-md">
                    {{ total }}
                </span>
            </div>

            <div class="id-line row items-center">
                <div class="id code">
                    {{ id }}
                </div>

                <div class="lang q-mx-md">
                    {{ lang }}
                </div>

                <q-btn-toggle
                    v-model="partIndex"
                    :options="partOptions"
                    outline dense
                />

                <div class="space" />

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
                        <q-input v-model="oracleName" dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="oracleTypeline" dense />
                    </td>
                    <td class="text">
                        <q-input v-model="oracleText" type="textarea" dense />
                    </td>
                </tr>
                <tr>
                    <td class="title">
                        Unified
                    </td>
                    <td class="name">
                        <q-input v-model="unifiedName" dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="unifiedTypeline" dense />
                    </td>
                    <td class="text">
                        <q-input v-model="unifiedText" type="textarea" dense />
                    </td>
                </tr>
                <tr>
                    <td class="title">
                        Printed
                    </td>
                    <td class="name">
                        <q-input v-model="printedName" dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="printedTypeline" dense />
                    </td>
                    <td class="text">
                        <q-input v-model="printedText" type="textarea" dense />
                    </td>
                </tr>
            </table>

            <q-input v-model="flavor" type="textarea" />
        </div>
    </div>
</template>

<style lang="stylus" scoped>
.card-not-found
    width 100%
    background-color transparent !important
    padding 0 !important

table
    width 100%

    & .title
        width 50px

    & .name
        width 150px

    & .typeline
        width 250px

</style>

<script>
import { imageBase } from 'boot/backend';

function field(firstKey, lastKey) {
    if (lastKey != null) {
        return {
            get() { return this.part?.[firstKey]?.[lastKey]; },
            set(newValue) {
                if (this.data != null) {
                    this.data.parts[this.partIndex][firstKey][lastKey] = newValue;
                }
            },
        };
    } else {
        return {
            get() { return this.part?.[firstKey]; },
            set(newValue) {
                if (this.data != null) {
                    this.data.parts[this.partIndex][firstKey] = newValue;
                }
            },
        };
    }
}

export default {
    name: 'DataCard',

    data: () => ({
        data: null,
    }),

    computed: {
        id() { return this.data?.cardId ?? this.$route.query.id; },
        lang() { return this.data?.lang ?? this.$route.query.lang; },
        set() { return this.data?.setId ?? this.$route.query.set; },
        number() { return this.data?.number ?? this.$route.query.number; },
        partIndex() { return this.data?.partIndex ?? this.$route.query.part ?? 0; },

        total() { return this.data?.total; },

        layout() { return this.data?.layout; },

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

        flavor: field('flavorText'),

        imageUrl() {
            if (this.data == null) {
                return null;
            }

            if (this.layout === 'transform') {
                return `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}&part=${this.partIndex}`;
            } else {
                return `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}`;
            }
        },

    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData(editType) {
            if (editType != null) {
                if (this.data != null) {
                    await this.update();
                }

                const { data } = await this.apiGet('/magic/card/need-edit', {
                    type: editType,
                    lang: this.$store.getters['magic/locale'],
                });

                if (data != null && data !== '') {
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
            await this.apiPost('/magic/card/update', {
                data: this.data,
            });
        },
    },
};
</script>

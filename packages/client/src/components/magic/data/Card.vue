<template>
    <div class="q-pa-md row">
        <div class="col-3 q-mr-md">
            <q-img
                :src="imageUrl" :ratio="745/1040"
                native-context-menu
            >
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
                    <q-btn outline label="Unified" @click="loadData('incorrect-unified')" />
                </q-btn-group>

                <span v-if="total != null" class="q-ml-md">
                    {{ total }}
                </span>
            </div>

            <div class="id-line row items-center">
                <div class="id code">
                    {{ id }}
                </div>

                <div class="lang q-ml-md">
                    {{ lang }}
                </div>

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
        dbQuery:   '',
        data:      null,
        partIndex: 0,
    }),

    computed: {

        id() { return this.$route.query.id ?? this.data?.cardId; },
        lang() { return this.$route.query.lang ?? this.data?.lang; },
        set() { return this.$route.query.set ?? this.data?.setId; },
        number() { return this.$route.query.number ?? this.data?.number; },

        imageUrl() {
            return `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}`;
        },

        total() { return this.data?.total; },

        part() { return this.data?.parts[this.partIndex]; },

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

    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData(special) {
            if (special != null) {
                if (this.data != null) {
                    await this.update();
                }

                const { data } = await this.apiGet('/magic/card/special', {
                    type: special,
                    lang: this.$store.getters['magic/locale'],
                });

                this.data = data;
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

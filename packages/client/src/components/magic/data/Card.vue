<template>
    <div v-if="data != null" class="q-pa-md row">
        <div class="col-2 q-mr-md">
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
            <div class="id-line row items-center">
                <div class="id code">
                    {{ data._id }}
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
        </div>
    </div>
</template>

<style lang="stylus" scoped>
table
    width 100%

</style>

<script>
import { imageBase } from 'boot/backend';

function field(firstKey, lastKey) {
    return {
        get() { return this.part?.[firstKey]?.[lastKey]; },
        set(newValue) {
            if (this.data != null) {
                this.data.parts[this.partIndex][firstKey][lastKey] = newValue;
            }
        },
    };
}

export default {
    name: 'DataCard',

    data: () => ({
        data:      null,
        partIndex: 0,
    }),

    computed: {
        id() { return this.$route.query.id; },
        lang() { return this.$route.query.lang; },
        set() { return this.$route.query.set; },
        number() { return this.$route.query.number; },

        imageUrl() {
            return `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}`;
        },

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
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            if (this.id && this.lang && this.set && this.number) {
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

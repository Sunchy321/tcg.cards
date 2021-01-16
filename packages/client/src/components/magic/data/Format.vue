<template>
    <div class="q-pa-md">
        <div class="row items-center">
            <q-select
                v-model="format"
                :options="formats"
                dense outlined
            />

            <div class="col-grow" />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="saveFormat"
            />
        </div>

        <div class="row items-center q-my-md q-gutter-md">
            <span>Birthday</span>
            <date-input
                v-model="birthday"
                dense
            />

            <span>Deathdate</span>
            <date-input
                v-model="deathdate"
                dense
            />
        </div>
    </div>
</template>

<script>
import DateInput from 'components/DateInput';

export default {
    name: 'DataFormat',

    components: { DateInput },

    data: () => ({
        formats: [],
        format:  null,

        data: null,
    }),

    computed: {
        birthday: {
            get() {
                return this.data?.birthday;
            },
            set(newValue) {
                if (this.data != null) {
                    this.$set(this.data, 'birthday', newValue);
                }
            },
        },

        deathdate: {
            get() {
                return this.data?.deathdate;
            },
            set(newValue) {
                if (this.data != null) {
                    this.$set(this.data, 'deathdate', newValue);
                }
            },
        },
    },

    watch: {
        format() {
            this.loadFormat();
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data } = await this.apiGet('/magic/format');

            this.formats = data;

            if (this.format == null) {
                this.format = this.formats[0];
            }
        },

        async loadFormat() {
            const { data } = await this.apiGet('/magic/format', { id: this.format });

            this.data = data;
        },

        async saveFormat() {
            await this.apiPost('/magic/format/save', { data: this.data });
            await this.loadFormat();
        },
    },
};
</script>

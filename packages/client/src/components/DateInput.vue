<template>
    <q-input
        :value="value"
        :dense="dense"
        :outlined="outlined"
        :clearable="clearable"
        @input="input"
        @change="change"
    >
        <template #append>
            <q-icon name="mdi-calendar" class="cursor-pointer">
                <q-popup-proxy ref="dateProxy">
                    <q-date
                        :value="value"
                        mask="YYYY-MM-DD"
                        minimal
                        :events="realEvents.map(e => e.date)"
                        :event-color="v => realEvents.find(e => e.date === v).color"
                        v-bind="dateAttrs"
                        @input="dateInput"
                    />
                </q-popup-proxy>
            </q-icon>
        </template>
    </q-input>
</template>

<script>
export default {
    props: {
        value: { required: true, validator: v => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v) },

        dense:     { type: Boolean, default: false },
        outlined:  { type: Boolean, default: false },
        clearable: { type: Boolean, default: false },

        events:   { type: Array, default: () => [] },
        dateFrom: { type: String, default: undefined, validator: v => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v) },
        dateTo:   { type: String, default: undefined, validator: v => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v) },
    },

    computed: {
        realDateFrom() { return this.dateFrom ? this.toQuasarDate(this.dateFrom) : this.dateFrom; },
        realDateTo() { return this.dateTo ? this.toQuasarDate(this.dateTo) : this.dateTo; },

        realEvents() {
            return this.events
                ? this.events.map(v => ({
                    date:  this.toQuasarDate(v.date),
                    color: v.color,
                })) : [];
        },

        dateAttrs() {
            const result = {};

            if (this.realDateFrom != null) {
                result.navigationMinYearMonth = this.realDateFrom.slice(0, 7);
            }

            if (this.realDateTo != null) {
                result.navigationMaxYearMonth = this.realDateTo.slice(0, 7);
            }

            if (this.realDateFrom != null || this.realDateTo != null) {
                result.options = d => {
                    if (this.realDateFrom != null && d < this.realDateFrom) {
                        return false;
                    }

                    if (this.realDateTo != null && d > this.realDateTo) {
                        return false;
                    }

                    return true;
                };
            }

            return result;
        },
    },

    methods: {
        toQuasarDate(v) {
            return v.replace(/-/g, '/');
        },

        input(v) {
            this.$refs.dateProxy.hide();
            this.$emit('input', v);
        },

        change(v) {
            this.$refs.dateProxy.hide();
            this.$emit('change', v);
        },

        dateInput(v) {
            this.$refs.dateProxy.hide();
            this.$emit('input', v);
            this.$emit('change', v);
        },
    },
};
</script>

<style>

</style>

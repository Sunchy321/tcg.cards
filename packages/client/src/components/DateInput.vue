<template>
    <q-input
        :value="value"
        :dense="dense"
        @input="input"
    >
        <template #append>
            <q-icon name="mdi-calendar" class="cursor-pointer">
                <q-popup-proxy ref="dateProxy">
                    <q-date
                        :value="value"
                        mask="YYYY-MM-DD"
                        @input="input"
                    />
                </q-popup-proxy>
            </q-icon>
        </template>
    </q-input>
</template>

<script>
export default {
    props: {
        value: {
            type:    String,
            default: undefined,
        },
        dense: {
            type:    Boolean,
            default: false,
        },
    },

    methods: {
        input(v) {
            this.$refs.dateProxy.hide();
            this.$emit('input', v);
        },
    },
};
</script>

<style>

</style>

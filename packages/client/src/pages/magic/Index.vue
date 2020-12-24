<template>
    <q-page>
        <q-input
            v-model="search"
            class="main-input q-ma-xl"
            filled
        />
        <div class="links q-pa-xl q-gutter-md row ">
            <div class="col column" />
            <div class="col column">
                <q-btn
                    class="link"
                    flat
                    icon="mdi-book-open-variant"
                    :label="$t('magic.cr.$self')"
                    to="/magic/cr"
                />
            </div>
            <div class="col column" />
            <div class="col column" />
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>

</style>

<script>
import magic from 'src/mixins/magic';

export default {
    mixins: [magic],

    computed: {
        search: {
            get() { return this.$store.getters.search; },
            set(newValue) { this.$store.commit('search', newValue); },
        },
    },
};
</script>

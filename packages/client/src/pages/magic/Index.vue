<template>
    <q-page>
        <q-input
            v-model="search"
            class="main-input q-ma-xl"
            filled
            @keypress.enter="doSearch"
        >
            <template slot="append">
                <q-btn
                    icon="mdi-magnify"
                    flat dense round
                    @click="doSearch"
                />
            </template>
        </q-input>
        <div class="links q-pa-xl q-gutter-md row ">
            <div class="col column" />
            <div class="col column">
                <q-btn
                    class="link"
                    flat
                    icon="mdi-text-box-outline"
                    :label="$t('magic.format.$self')"
                    to="/magic/format/standard"
                />
            </div>
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
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>

</style>

<script>
import page from 'src/mixins/page';
import magic from 'src/mixins/magic';

export default {
    mixins: [page, magic],

    computed: {
        pageOptions() {
            return {
                actions: [
                    { icon: 'mdi-shuffle-variant', action: 'random' },
                ],
            };
        },

        title() { return this.$t('magic.$self'); },

        search: {
            get() { return this.$store.getters.search; },
            set(newValue) { this.$store.commit('search', newValue); },
        },
    },

    methods: {
        doSearch() {
            this.$store.commit('event', { type: 'search' });
        },
    },
};
</script>

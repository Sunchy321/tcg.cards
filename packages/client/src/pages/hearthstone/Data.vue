<template>
    <q-page>
        <q-tabs v-model="tab">
            <q-tab
                v-for="t in tabs"
                :key="t"
                :name="t"
                :label="t.replace('-', ' ')"
            />
        </q-tabs>

        <component :is="tab" />
    </q-page>
</template>

<style lang="stylus" scoped>

.flex-grow
    flex-grow 1

</style>

<script>
import * as components from 'components/hearthstone/data';

export default {
    name: 'Data',

    components: { ...components },

    computed: {
        tabs() {
            return Object.keys(components);
        },

        tab: {
            get() {
                return this.$route.query.tab ?? this.tabs[0];
            },
            set(newValue) {
                this.$router.replace({ query: { tab: newValue } });
            },
        },
    },

};
</script>

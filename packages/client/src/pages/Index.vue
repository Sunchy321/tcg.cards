<template>
    <q-page class="q-ma-md">
        <q-btn
            v-for="g in games" :key="g"
            no-caps flat align="left" class="tcg-item"
            @click="$router.push('/' + g)"
        >
            {{ fullName(g) }}
        </q-btn>
    </q-page>
</template>

<style lang="stylus" scoped>

.tcg-item
    width 25%

</style>

<script>
import basic from '../mixins/basic';

export default {
    name: 'PageIndex',

    mixins: [basic],

    computed: {
        games() {
            return this.$store.state.core.games || [];
        }
    },

    methods: {
        fullName(g) {
            if (this.$te(g + '.$selfFull')) {
                return this.$t(g + '.$selfFull');
            } else {
                return this.$t(g + '.$self');
            }
        }
    }
};
</script>

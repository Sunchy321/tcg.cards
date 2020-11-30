<template>
    <q-page>
        <div class="flex justify-center q-mt-md q-gutter-md">
            <router-link
                v-for="(c, i) in cards" :key="i"
                :to="`/magic/card/${c.cardId}?set=${c.set}&number=${c.number}&lang=${c.lang}`"
            >
                <card-image
                    :set="c.set"
                    :number="c.number"
                    :lang="c.lang"
                    :layout="c.layout"
                />
            </router-link>
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>

.card-image
    width 200px

</style>

<script>
import CardImage from 'components/magic/CardImage';

export default {
    name: 'Search',

    components: { CardImage },

    data: () => ({
        data:        null,
        unsubscribe: null,
    }),

    computed: {
        q() { return this.$route.query.q; },
        cards() { return this.data?.result?.cards || []; },
    },

    beforeRouteEnter(to, from, next) {
        next(vm => {
            vm.search();

            vm.unsubscribe = vm.$store.subscribe(({ type, payload }) => {
                console.log(type, payload);

                if (type === 'event' && payload.type === 'search') {
                    vm.search();
                }
            });
        });
    },

    beforeRouteLeave(to, from, next) {
        this.unsubscribe();
        next();
    },

    methods: {
        async search() {
            const { data } = await this.apiGet('/magic/search', {
                q:      this.q,
                locale: this.$store.getters['magic/locale'],
            });

            this.data = data;
        },
    },
};
</script>

<style>

</style>

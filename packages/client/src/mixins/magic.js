import basic from './basic';

export default {
    mixins: [basic],

    methods: {
        'event/search'() {
            if (this.$store.getters.search !== '') {
                this.$router.push({
                    name:  'magic/search',
                    query: { q: this.$store.getters.search },
                });
            }
        },
        async 'event/random'() {
            const { data: id } = await this.apiGet('/magic/card/random', {
                q: this.$store.getters.search,
            });

            if (id !== '') {
                this.$router.push({
                    name:   'magic/card',
                    params: { id },
                    query:  { q: this.q === '' ? undefined : this.q },
                });
            }
        },
    },
};

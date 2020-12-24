import basic from './basic';

export default {
    mixins: [basic],

    data: () => ({
        baseUnsubscribe: null,
    }),

    beforeRouteEnter(to, from, next) {
        next(vm => {
            vm.baseUnsubscribe = vm.$store.subscribe(async ({ type, payload }) => {
                if (type === 'event') {
                    switch (payload.type) {
                    case 'search': {
                        if (vm.$store.getters.search !== '') {
                            vm.$router.push({
                                name:  'magic/search',
                                query: { q: vm.$store.getters.search },
                            });
                        }

                        break;
                    }
                    case 'random': {
                        const { data: id } = await vm.apiGet('/magic/card/random', {
                            q: vm.$store.getters.search,
                        });

                        vm.$router.push({
                            name:   'magic/card',
                            params: { id },
                            query:  { q: vm.q === '' ? undefined : vm.q },
                        });

                        break;
                    }
                    }
                }
            });
        });
    },

    beforeRouteLeave(to, from, next) {
        this.baseUnsubscribe?.();
        next();
    },
};

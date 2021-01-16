export default {
    computed: {
        games() { return this.$store.state.core.games ?? []; },

        game() {
            const path = this.$route.path;
            const firstPart = path.split('/').filter(v => v !== '')[0];
            return this.games.includes(firstPart) ? firstPart : null;
        },

        user() { return this.$store.getters['user/user']; },
        isAdmin() { return this.$store.getters['user/isAdmin']; },

        meta() { return this.$route.meta; },

        param: {
            get() {
                if (this.meta.param) {
                    return this.$store.getters.param;
                } else {
                    return null;
                }
            },
            set(newValue) {
                if (this.meta.param && this.param !== newValue) {
                    this.$store.commit('param', newValue);
                } else {
                    return null;
                }
            },
        },

        paramOptions: {
            get() { return this.$store.getters.paramOptions ?? []; },
            set(newValue) { this.$store.commit('paramOptions', newValue); },
        },
    },
};

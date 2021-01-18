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
    },
};

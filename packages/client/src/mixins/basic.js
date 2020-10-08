export default {
    computed: {
        games() {
            return this.$store.state.core.games || [];
        },

        game() {
            const path = this.$route.path;

            const firstPart = path.split('/').filter(v => v !== '')[0];

            if (this.games.includes(firstPart)) {
                return firstPart;
            }

            return null;
        },

        loggedIn() {
            return this.$store.getters.profile != null;
        },

        isAdmin() {
            return this.$store.getters.isAdmin;
        }
    }
};

export default {
    computed: {
        basic() {
            return this.$store.state.core.basic;
        },

        game() {
            const path = this.$route.path;

            return path.split('/').filter(v => v !== '')[0];
        }
    }
};

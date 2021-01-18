export default {
    watch: {
        pageOptions: {
            immediate: true,
            handler() {
                this.$store.commit('pageOptions', this.pageOptions ?? { });
            },
        },

        title: {
            immediate: true,
            handler() {
                this.$store.commit('title', this.title ?? '');
            },
        },
    },
}
;

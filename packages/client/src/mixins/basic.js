import { last } from 'lodash';

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

        selection: {
            get() {
                if (this.meta.select != null) {
                    const select = this.$route.query[this.meta.select];

                    if (select != null) {
                        return select;
                    }

                    const selections = this.$store.getters.selections;
                    const selectDefault = this.meta.selectDefault;

                    if (selectDefault === '$last') {
                        return last(selections);
                    } else if (selectDefault == null) {
                        return selections[0];
                    } else {
                        return selectDefault;
                    }
                } else {
                    return null;
                }
            },
            set(newValue) {
                if (this.meta.select != null && this.selection !== newValue) {
                    this.$router.push({
                        query: {
                            ...this.$route.query,
                            [this.meta.select]: newValue,
                        },
                    });
                } else {
                    return null;
                }
            },
        },

        selections() { return this.$store.getters.selections ?? []; },
    },
};

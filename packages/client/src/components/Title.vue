<script>
import { capitalize } from 'lodash';

export default {
    computed: {
        q: {
            get() {
                return this.$route.query.q;
            },

            set(newValue) {
                if (newValue === '') {
                    // eslint-disable-next-line no-unused-vars
                    const { q, removeQ } = this.$route.query;

                    this.$router.replace({
                        query: removeQ,
                    });
                } else {
                    this.$router.replace({
                        query: {
                            ...this.$route.query,
                            q: newValue,
                        },
                    });
                }
            },
        },

        titleMeta() {
            const titleMatch = this.$route.matched.find(
                r => r.meta.title != null,
            );

            return titleMatch?.meta.title;
        },

        title() {
            const titleMeta = this.titleMeta;

            if (titleMeta === null) {
                const regex = /\//g;
                return this.$route.path.slice(1).replace(regex, '.');
            }

            if (titleMeta === '$input') {
                return <q-input
                    class="title-input"
                    dense outlined
                    color="white"
                    value={this.q}
                    onInput={v => { this.q = v; }}
                >
                    <template slot="append">
                        <div></div>
                    </template>
                </q-input>;
            }

            return capitalize(this.$t(titleMeta));
        },
    },

    render() {
        return <q-toolbar-title>
            { this.title }
        </q-toolbar-title>;
    },
};
</script>

<style lang="stylus">
.title-input input
    color white

</style>

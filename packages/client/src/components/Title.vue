<script>
import basic from 'src/mixins/basic';

export default {
    mixins: [basic],

    computed: {
        search: {
            get() { return this.$store.getters.search; },
            set(newValue) { this.$store.commit('search', newValue); },
        },

        titleInput() {
            return <q-input
                class="title-input"
                dense dark standout
                value={this.search}
                onInput={v => { this.search = v; }}
                onKeypress={e => {
                    if (e.keyCode === 13) {
                        this.$store.commit('event', { type: 'search' });
                    }
                }}
            >
                <template slot="append">
                    <q-btn
                        icon="mdi-magnify"
                        flat dense round
                        onClick={() => this.$store.commit('event', { type: 'search' })}
                    />
                </template>
            </q-input>;
        },

        title() {
            switch (this.$store.getters.titleOption) {
            case 'text':
                return this.$store.getters.title;
            case 'input':
                return this.titleInput;
            default:
                return '';
            }
        },
    },

    watch: {
        $route: {
            immediate: true,
            handler() {
                const q = this.$route.query.q;

                if (q != null && q !== '') {
                    this.search = q;
                }
            },
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

.title-input
    transition 0.5s

</style>

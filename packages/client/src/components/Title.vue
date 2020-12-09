<script>
import basic from 'src/mixins/basic';

import { capitalize } from 'lodash';

export default {
    mixins: [basic],

    computed: {
        meta() {
            return this.$route.meta;
        },

        titleText() { return this.meta?.title; },
        fixedInput() { return this.meta?.fixedInput; },
        inputClass() { return this.meta?.inputClass; },

        titleInput() {
            let klass = 'title-input';

            if (this.inputClass != null) {
                klass += ' ' + this.inputClass;
            }

            return <q-input
                class={klass}
                dense={!this.fixedInput}
                dark={!this.fixedInput}
                standout={!this.fixedInput}
                filled={this.fixedInput}
                value={this.q}
                onInput={v => { this.q = v; }}
                onChange={() => this.$store.commit('event', { type: 'search' })}
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
            const titleText = this.titleText;

            if (titleText === '$input') {
                return this.titleInput;
            }

            const text = titleText != null
                ? capitalize(this.$t(titleText))
                : this.$route.path.slice(1).replace(new RegExp('/', 'g'), '.');

            if (this.fixedInput) {
                return [text, this.titleInput];
            } else {
                return text;
            }
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

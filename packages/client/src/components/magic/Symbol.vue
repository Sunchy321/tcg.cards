<style lang="stylus">
.magic-symbol
    height 1em
    width 1em

    &.icon-100
        width 1.88em

    &.icon-1000000
        width 5.08em

    &.icon-CHAOS
        width 1.20em
</style>

<script>
export default {
    name: 'MagicSymbol',

    props: {
        value: {
            type:     String,
            required: true,
        },

        type: {
            type:    String,
            default: 'modern',
        },
    },

    computed: {
        actualValue() {
            switch (this.value) {
            case 'T':
                return {
                    old1:   'T,old1',
                    old2:   'T,old2',
                    modern: 'T',
                }[this.type] ?? 'T';
            case 'W':
                return {
                    old:    'W,old',
                    modern: 'W',
                }[this.type] ?? 'W';
            default:
                return this.value;
            }
        },
    },

    render() {
        const klass = 'magic-symbol icon-' + this.actualValue;
        const src = `magic/symbols.svg#icon-${this.actualValue}`;

        return <img class={klass} src={src} alt={`{${this.value}}`} />;
    },
};
</script>

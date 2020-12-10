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
function calcActualValue(value, type) {
    switch (value) {
    case 'T':
        return {
            old1:   'T,old1',
            old2:   'T,old2',
            modern: 'T',
        }[type] ?? 'T';
    case 'W':
        return {
            old:    'W,old',
            modern: 'W',
        }[type] ?? 'W';
    default:
        return value;
    }
}

export default {
    name: 'MagicSymbol',

    functional: true,

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

    render(h, { props, data }) {
        const actualValue = calcActualValue(props.value, props.type);

        const klass = 'magic-symbol icon-' + actualValue +
            (data.class ? ' ' + data.class : '');
        const src = `magic/symbols.svg#icon-${actualValue}`;

        return <img class={klass} src={src} alt={`{${props.value}}`} />;
    },
};
</script>

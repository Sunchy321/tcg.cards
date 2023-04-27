<style lang="sass">
@function get-class($name, $prefix: '')
    @if $name != null
        @return '.#{$prefix}#{$name}'
    @else
        @return ''

@function feature-setting($type, $tap, $white)
    $feature: ()

    @if $type == 'shadow'
        $feature: append($feature, 'salt' 1, $separator: comma)
    @else if $type == 'flat'
        $feature: append($feature, 'salt' 2, $separator: comma)

    @if $tap == 'old1'
        $feature: append($feature, 'ss01', $separator: comma)
    @else if $tap == 'old2'
        $feature: append($feature, 'ss02', $separator: comma)

    @if $white == 'old'
        $feature: append($feature, 'ss03', $separator: comma)

    @return $feature

.magic-symbol
    font-family: magic-symbol
    display: inline-block

    @each $type in null, shadow, flat
        @each $tap in null, old1, old2
            @each $white in null, old
                &#{get-class($type)}#{get-class($tap, 'tap-')}#{get-class($white, 'white-')}
                    @if length(feature-setting($type, $tap, $white)) > 0
                        font-feature-settings: feature-setting($type, $tap, $white)

    &.cost
        margin-right: 1px

    &.mini
        font-size: 50%
</style>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent, h } from 'vue';

export default defineComponent({
    name: 'MagicSymbol',

    functional: true,

    props: {
        value: {
            type:     String,
            required: true,
        },

        type: {
            type:    Array as PropType<string[]>,
            default: () => ['modern'],
        },
    },

    setup(props) {
        return () => {
            const rawType = props.type;

            const type = [
                ...rawType.filter(t => t !== 'flat-cost'),
                ...rawType.includes('flat-cost') && rawType.includes('cost') ? ['flat'] : [],
            ];

            let klass = 'magic-symbol';

            if (type.includes('cost')) {
                klass += ' cost';

                if (!type.includes('flat')) {
                    klass += ' shadow';
                }
            }

            if (type.includes('flat')) {
                klass += ' flat';
            }

            if (type.includes('mini')) {
                klass += ' mini';
            }

            if (type.includes('tap:old1')) {
                klass += ' tap-old1';
            }

            if (type.includes('tap:old2')) {
                klass += ' tap-old2';
            }

            if (type.includes('white:old')) {
                klass += ' white-old';
            }

            return h('span', { class: klass }, props.value);
        };
    },
});
</script>

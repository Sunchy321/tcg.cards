<style lang="stylus" scoped>
.magic-symbol
    transform translateY(10%)

    [lang=zhs] &, [lang=zht] &
        transform translateY(15%)
        margin-left 2px

    [lang=zhs] & + span, [lang=zht] & + span
        margin-left 2px

    [lang=zhs] & + &, [lang=zht] & + &,
    [lang=zhs] &:first-child, [lang=zht] &:first-child,
    br + &
        margin-left 0px !important
</style>

<script>
import Symbol from './Symbol';

export default {
    functional: true,

    props: {
        type: {
            type:    Array,
            default: () => [],
        },
    },

    render(h, { props, parent, data, slots }) {
        const defaultSlot = slots().default;

        const symbols = parent.$store.getters['magic/data'].symbols || [];

        const result = [];

        for (const node of defaultSlot) {
            if (node.tag != null) {
                result.push(node);
                continue;
            }

            const pieces = node.text.trim().split(/(\n|\{[^}]+\})/).filter(v => v !== '');

            for (const p of pieces) {
                if (p === '\n') {
                    result.push(<br />);
                } else if (p.startsWith('{') && p.endsWith('}')) {
                    const content = p.slice(1, -1);

                    if (symbols.includes(content)) {
                        result.push(<Symbol class={data.class} value={content} type={props.type} />);
                    } else {
                        result.push(<span class={data.class}>{p}</span>);
                    }
                } else {
                    result.push(<span class={data.class}>{p}</span>);
                }
            }
        }

        return result;
    },
};
</script>

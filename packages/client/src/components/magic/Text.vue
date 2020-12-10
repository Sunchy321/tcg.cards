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
        value: { type: String, required: true },
        tap:   {
            type:    String,
            default: 'modern',
        },
        white: {
            type:    String,
            default: 'modern',
        },
    },

    render(h, { props, parent, data }) {
        const symbols = parent.$store.getters['magic/data'].symbols || [];

        const pieces = props.value.split(/(\n|\{[^}]+\})/).filter(v => v !== '');

        const result = [];

        for (const p of pieces) {
            if (p === '\n') {
                result.push(<br />);
            } else if (p.startsWith('{') && p.endsWith('}')) {
                const content = p.slice(1, -1);

                if (symbols.includes(content)) {
                    switch (content) {
                    case 'T':
                        result.push(<Symbol class={data.class} value={content} type={props.tap} />);
                        break;
                    case 'W':
                        result.push(<Symbol class={data.class} value={content} type={props.white} />);
                        break;
                    default:
                        result.push(<Symbol class={data.class} value={content} />);
                    }
                } else {
                    result.push(<span class={data.class}>{p}</span>);
                }
            } else {
                result.push(<span class={data.class}>{p}</span>);
            }
        }

        return result;
    },
};
</script>

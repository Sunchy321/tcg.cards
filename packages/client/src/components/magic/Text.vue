<style lang="stylus" scoped>
.magic-symbol
    transform translateY(10%)

    [lang=zhs] &, [lang=zht] &
        transform translateY(15%)
        margin-left 2px

    [lang=zhs] & + &, [lang=zht] & + &,
    [lang=zhs] &:first-child, [lang=zht] &:first-child,
    br + &
        margin-left 0px !important
</style>

<script>
import Symbol from './Symbol';

export default {
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

    render() {
        const symbols = this.$store.getters['magic/data'].symbols || [];

        const pieces = this.value.split(/(\n|\{[^}]+\})/).filter(v => v !== '');

        const result = [];

        for (const p of pieces) {
            if (p === '\n') {
                result.push(<br />);
            } else if (p.startsWith('{') && p.endsWith('}')) {
                const content = p.slice(1, -1);

                if (symbols.includes(content)) {
                    switch (content) {
                    case 'T':
                        result.push(<Symbol value={content} type={this.tap} />);
                        break;
                    case 'W':
                        result.push(<Symbol value={content} type={this.white} />);
                        break;
                    default:
                        result.push(<Symbol value={content} />);
                    }
                } else {
                    result.push(<span>{p}</span>);
                }
            } else {
                result.push(<span>{p}</span>);
            }
        }

        return <div>{result}</div>;
    },
};
</script>

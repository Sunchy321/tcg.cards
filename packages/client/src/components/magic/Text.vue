<style lang="stylus" scoped>
.magic-symbol
    transform translateY(10%)

    [lang=zhs] &, [lang=zht] &
        transform translateY(15%)
        margin-left 2px

    [lang=zhs] & + &, [lang=zht] & + &,
    [lang=zhs] &:first-child, [lang=zht] &:first-child
        margin-left 0px
</style>

<script>
export default {
    props: {
        value: { type: String, required: true },
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
                    const klass = 'magic-symbol icon-' + content;
                    const src = `magic/symbols.svg#icon-${content}`;

                    result.push(<img class={klass} src={src} alt={p} />);
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

<script>
const colorMap = {
    W: '#F5F1ED',
    U: '#006BA7',
    B: '#3C3734',
    R: '#E5412A',
    G: '#006B47',
};

const toPart = {
    '':  [],
    'W': ['W'],
    'U': ['U'],
    'B': ['B'],
    'R': ['R'],
    'G': ['G'],
};

export default {
    props: {
        value: {
            type:     String,
            required: true,
        },
    },
    methods: {
        renderElems() {
            const value = toPart[this.value].map(v => colorMap[v]);

            switch (value.length) {
            case 0:
                return <circle r="50" cy="50" cx="50" stroke="black" stroke-width="5" />;
            case 1:
                return <circle r="50" cy="50" cx="50" fill={value[0]} />;
            case 2:
                return [
                    <path d="M35.35534,35.35534" fill={value[0]} />,
                ];
            }
        },
    },

    render() {
        return <svg viewBox="0 0 100 100">{this.renderElems()}</svg>;
    },
};
</script>

<style>

</style>

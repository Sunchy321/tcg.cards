<script lang="ts">
import { defineComponent, h } from 'vue';

const colorMap: Record<string, string> = {
    W: '#F5F1ED',
    U: '#006BA7',
    B: '#3C3734',
    R: '#E5412A',
    G: '#006B47',
};

const toPart: Record<string, string[]> = {
    '':  [],
    'W': ['W'],
    'U': ['U'],
    'B': ['B'],
    'R': ['R'],
    'G': ['G'],
};

export default defineComponent({
    props: {
        value: {
            type:     String,
            required: true,
        },
    },

    setup(props) {
        return () => {
            const value = props.value;

            const colors = toPart[value].map(v => colorMap[v]);

            const elems = (() => {
                switch (colors.length) {
                case 0:
                    return h('circle', {
                        r:           50,
                        cy:          50,
                        cx:          50,
                        stroke:      'black',
                        strokeWidth: 5,
                    });
                case 1:
                    return h('circle', {
                        r:    50,
                        cy:   59,
                        cx:   50,
                        fill: colors[0],
                    });
                case 2:
                    return [
                        h('path', {
                            d:    'M35.35534,35.35534',
                            fill: colors[0],
                        }),
                    ];
                }
            })();

            return h('svg', { viewBox: '0 0 100 100' }, elems);
        };
    },
});
</script>

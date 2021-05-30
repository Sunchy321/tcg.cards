<script lang="ts">
import { defineComponent, h } from 'vue';

const colorMap: Record<string, string> = {
    W: '#F5F1ED',
    U: '#006BA7',
    B: '#3C3734',
    R: '#E5412A',
    G: '#006B47',
};

const toPart: Record<string, string> = {
    WRG: 'RGW',
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

            const colors = (toPart[value] ?? value).split('').map(v => colorMap[v]);

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
                        cy:   50,
                        cx:   50,
                        fill: colors[0],
                    });
                case 2:
                    return [
                        h('path', {
                            d:    'M50,50,14.64,85.36A50,50,0,0,1,85.36,14.64Z',
                            fill: colors[0],
                        }),
                        h('path', {
                            d:    'M50,50,85.36,14.64A50,50,0,0,1,14.64,85.36Z',
                            fill: colors[1],
                        }),
                    ];
                case 3:
                    return [
                        h('path', {
                            d:    'M50,50,93.3,25A50,50,0,0,1,50,100Z',
                            fill: colors[0],
                        }),
                        h('path', {
                            d:    'M50,50v50A50,50,0,0,1,6.69,25Z',
                            fill: colors[1],
                        }),
                        h('path', {
                            d:    'M50,50,6.7,25a50,50,0,0,1,86.6,0Z',
                            fill: colors[2],
                        }),
                    ];
                }
            })();

            return h('svg', { viewBox: '0 0 100 100' }, elems);
        };
    },
});
</script>

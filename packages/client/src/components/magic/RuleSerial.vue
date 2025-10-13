<template>
    <render />
</template>

<script setup lang="ts">
import { h } from 'vue';

const props = withDefaults(defineProps<{
    itemId:        string;
    serial:        string | null;
    outOfChapter?: boolean;
}>(), {
    outOfChapter: false,
});

const render = () => {
    if (props.serial == null) {
        if (props.outOfChapter) {
            return h('span', {
                style: {
                    marginRight: '4px',
                },
            }, [
                h('span', {
                    style: {
                        border:          '1px solid #ddd',
                        borderRadius:    '4px',
                        padding:         '2px 6px',
                        fontSize:        '0.85em',
                        backgroundColor: '#f8f9fa',
                        display:         'inline-block',
                    },
                }, [h('code', props.itemId)]),
            ]);
        } else {
            return null;
        }
    }

    if (props.serial.includes(':e')) {
        const m = /(.*?):e(\d+)$/.exec(props.serial);

        if (m != null) {
            const index = Number.parseInt(m[2], 10) + 1;

            if (props.outOfChapter) {
                return h('span', [
                    m[1],
                    h('span', { class: 'text-secondary' }, ` (example ${index})`),
                    ' ',
                ]);
            } else {
                return h('span', [
                    h('span', { class: 'text-secondary' }, ` (example ${index})`),
                    ' ',
                ]);
            }
        }
    }

    return h('span', [
        props.serial + ' ',
    ]);
};

</script>

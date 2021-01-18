<template>
    <q-page>
        <div class="main-input q-ma-xl">
            <q-input filled size="md" />
        </div>
        <div />
    </q-page>
</template>

<script>
import page from 'src/mixins/page';
import basic from '../../mixins/basic';

export default {
    name: 'Hearthstone',

    mixins: [page, basic],

    computed: {
        title() {
            return this.$t('hearthstone.$self');
        },
    },
};
</script>

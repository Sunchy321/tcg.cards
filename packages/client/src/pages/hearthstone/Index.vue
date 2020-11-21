<template>
    <q-page>
        <div class="main-input q-ma-xl">
            <q-input filled size="md" />
        </div>
        <div />
    </q-page>
</template>

<style lang="stylus" scoped>
.link
    font-size 120%

    &.admin
        font-style italic
</style>

<script>
import basic from '../../mixins/basic';

export default {
    name: 'Hearthstone',

    mixins: [basic],

    computed: {
        adminLinks() {
            return [
                {
                    name:  'hsdata.$self',
                    to:    'hsdata',
                    admin: true,
                },
            ];
        },
    },
};
</script>

<template>
    <q-page>
        <div class="main-input q-ma-xl">
            <q-input filled size="md" />
        </div>
        <div />
        <div class="links q-pa-md">
            <router-link
                v-for="l in adminLinks"
                :key="l.name"
                :to="'/hearthstone/' + l.to"
                class="link admin"
            >
                {{ $t('hearthstone.' + l.name) }}
            </router-link>
        </div>
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

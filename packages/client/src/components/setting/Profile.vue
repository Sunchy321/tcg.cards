<template>
    <div>
        <div class="header column items-center q-pa-lg q-mb-md">
            <div class="name">
                {{ user.username }}
            </div>
            <div class="role">
                {{ $t('user.role.' + user.role) }}
            </div>
        </div>
        <div class="action flex">
            <q-btn flat :label="$t('user.logout')" @click="logout" />
        </div>
    </div>
</template>

<style lang="stylus" scoped>
.left-panel
    border-right 1px solid #DDD
    margin-top 10px
    margin-bottom 10px

.header
    border-radius 5px
    background-color lighten($primary, 20%)
    color white

.name
    font-size 120%
</style>

<script>
import basic from 'src/mixins/basic';

export default {
    name: 'Profile',

    mixins: [basic],

    methods: {
        async logout() {
            this.$store.dispatch('user/logout');
        },
    },
};
</script>

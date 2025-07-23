<template>
    <div>
        <div class="header column items-center q-pa-lg q-mb-md" :class="`role-${role}`">
            <div class="name">
                {{ username }}
            </div>
            <div class="role">
                {{ $t('user.role.' + role) }}
            </div>
        </div>
        <div class="action flex">
            <q-btn flat :label="$t('user.logout')" @click="logout" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { auth } from '@/auth';

const session = auth.useSession();

const user = computed(() => {
    return session.value.data.user;
});

const username = computed(() => {
    return user.value.name;
});

const role = computed(() => {
    return user.value.role;
});

const logout = () => {
    auth.signOut();
};

</script>

<style lang="sass" scoped>
.header
    border-radius: 5px
    background-color: lighten($primary, 20%)
    color: rgba(50, 50, 50, 0.9)

    .name
        font-size: 1.4rem
        font-weight: 500

    .role
        font-size: 0.9rem
        opacity: 0.9

    &.role-owner
        background-color: lighten($amber, 10%)
        color: darken($amber, 35%)

    &.role-admin
        background-color: lighten($orange, 10%)
        color: darken($orange, 35%)

    &.role-user
        background-color: lighten($primary, 20%)
        color: darken($primary, 35%)

    &.role-guest
        background-color: lighten($grey, 10%)
        color: darken($grey, 35%)

.name
    font-size: 120%
</style>

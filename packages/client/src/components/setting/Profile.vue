<template>
    <div>
        <div class="header column items-center q-pa-lg q-mb-md">
            <div class="name">
                {{ user?.username }}
            </div>
            <div class="role">
                {{ $t('user.role.' + user?.role) }}
            </div>
        </div>
        <div class="action flex">
            <q-btn flat :label="$t('user.logout')" @click="logout" />
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { useUser } from 'store/user';
import basicSetup from 'setup/basic';

export default defineComponent({
    name: 'Profile',

    setup() {
        const userStore = useUser();
        const { user } = basicSetup();

        const logout = () => { userStore.logout(); };

        return {
            user,
            logout,
        };
    },
});
</script>

<style lang="sass" scoped>
.header
    border-radius: 5px
    background-color: lighten($primary, 20%)
    color: white

.name
    font-size: 120%
</style>

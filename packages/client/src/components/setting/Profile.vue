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

<style lang="sass" scoped>
.header
    border-radius: 5px
    background-color: lighten($primary, 20%)
    color: white

.name
    font-size: 120%
</style>

<script lang="ts">
import { defineComponent } from 'vue';

import { useStore } from 'src/store';
import basicSetup from 'setup/basic';

export default defineComponent({
    name: 'Profile',

    setup() {
        const store = useStore();
        const basic = basicSetup();

        const logout = () => {
            void store.dispatch('user/logout');
        };

        return {
            user: basic.user,
            logout,
        };
    },
});
</script>

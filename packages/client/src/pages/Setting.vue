<template>
    <q-page class="row">
        <aside class="left-panel column items-stretch q-pa-md">
            <component :is="user == null ? 'user-login' : 'user-profile'" />

            <q-tabs v-model="tab" class="left-tabs" vertical>
                <q-tab name="basic" :label="$t('setting.basic')" />
            </q-tabs>
        </aside>
        <component :is="main" class="body col q-pa-md" />
    </q-page>
</template>

<style lang="sass" scoped>
.left-panel
    border-right: 1px solid #DDD
    margin-top: 10px
    margin-bottom: 10px

.left-tabs
    height: auto
</style>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import { useI18n } from 'vue-i18n';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

import UserLogin from 'components/setting/Login.vue';
import UserProfile from 'components/setting/Profile.vue';

import MainBasic from 'components/setting/main/Basic.vue';

export default defineComponent({
    components: {
        UserLogin, UserProfile,
    },

    setup() {
        const i18n = useI18n();

        const { user } = basicSetup();

        pageSetup({
            title: () => i18n.t('setting.$self'),
        });

        const tab = ref('basic');

        const main = computed(() => {
            switch (tab.value) {
            case 'basic':
                return MainBasic;
            default:
                return null;
            }
        });

        return {
            user,
            tab,
            main,
        };
    },
});
</script>

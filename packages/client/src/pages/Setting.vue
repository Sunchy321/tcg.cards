<template>
    <q-page class="row">
        <aside class="left-panel col-3 column items-strech q-pa-md">
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

<script>
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

        const basic = basicSetup();

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
            user: basic.user,
            tab,
            main,
        };
    },

    // mounted() {
    //     this.$store.subscribe(async ({ type }) => {
    //         const { redirect, admin } = this.$route.query;

    //         if (type === 'user/user' && redirect != null) {
    //             if (admin === undefined || this.$store.getters['user/isAdmin']) {
    //                 void router.replace(redirect);
    //             }
    //         }
    //     });
    // },
});
</script>

<template>
    <q-page class="row">
        <aside class="left-panel col-3 column items-strech q-pa-md">
            <component :is="user == null ? 'user-login' : 'user-profile'" />

            <q-tabs v-model="tab" class="left-tabs" vertical>
                <q-tab name="basic" :label="$t('setting.basic')" />
            </q-tabs>
        </aside>
        <article :is="mainComponent" class="body col q-pa-md" />
    </q-page>
</template>

<style lang="stylus" scoped>
.left-panel
    border-right 1px solid #DDD
    margin-top 10px
    margin-bottom 10px

.left-tabs
    height auto
</style>

<script>
import page from 'src/mixins/page';
import basic from 'src/mixins/basic';

import UserLogin from 'components/setting/Login';
import UserProfile from 'components/setting/Profile';

import MainBasic from 'components/setting/main/Basic';

export default {
    name: 'Setting',

    components: {
        UserLogin, UserProfile,
    },

    mixins: [page, basic],

    data: () => ({
        tab: 'basic',
    }),

    computed: {
        title() { return this.$t('setting.$self'); },

        mainComponent() {
            switch (this.tab) {
            case 'basic':
                return MainBasic;
            default:
                return null;
            }
        },
    },

    mounted() {
        this.$store.subscribe(async ({ type }) => {
            const { redirect, admin } = this.$route.query;

            if (type === 'user/user' && redirect != null) {
                if (admin === undefined || this.$store.getters['user/isAdmin']) {
                    this.$router.replace(redirect);
                }
            }
        });
    },
};
</script>

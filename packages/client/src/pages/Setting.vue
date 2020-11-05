<template>
    <q-page class="row">
        <aside class="left-panel col-3 column items-strech q-pa-md">
            <component :is="user == null ? 'user-login' : 'user-profile'" />

            <q-tabs vertical>
                <q-tab name="basic" :label="$t('setting.basic')" />
            </q-tabs>
        </aside>
        <article class="body col" />
    </q-page>
</template>

<script>
import UserLogin from 'components/setting/Login';
import UserProfile from 'components/setting/Profile';

import basic from 'src/mixins/basic';

export default {
    name: 'Setting',

    components: {
        UserLogin,
        UserProfile,
    },

    mixins: [basic],

    data: () => ({
        model: 'basic',
    }),

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

    methods: {

    },
};
</script>

<template>
    <q-page class="row">
        <aside class="left-panel col-3 column items-strech q-pa-md">
            <template v-if="user == null">
                <q-form class="q-pa-md q-gutter-md">
                    <q-input
                        v-model="username"
                        filled
                        :label="$t('login.username')"
                    />
                    <q-input
                        v-model="password"
                        filled
                        :type="showPassword ? 'text' : 'password'"
                        :label="$t('login.password')"
                        :hint="$t('login.passwordHint')"
                    >
                        <template v-slot:append>
                            <q-icon
                                :name="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                                class="cursor-pointer"
                                @click="showPassword = !showPassword"
                            />
                        </template>
                    </q-input>
                    <div class="flex items-center justify-center">
                        <q-btn
                            class="col q-ma-sm"
                            :label="$t('login.register')"
                            @click="register"
                        />
                        <q-btn
                            class="col q-ma-sm"
                            color="primary"
                            :label="$t('login.login')"
                            @click="login"
                        />
                    </div>
                </q-form>
            </template>
            <template v-else>
                <div class="header column items-center q-pa-lg q-mb-md">
                    <div class="name">
                        {{ user.username }}
                    </div>
                    <div class="role">
                        {{ $t('profile.role.' + user.role) }}
                    </div>
                </div>
                <div class="action flex">
                    <q-btn flat :label="$t('profile.logout')" @click="logout" />
                </div>
            </template>
        </aside>
        <article class="body col" />
    </q-page>
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
import { camelCase } from 'lodash';

import basic from 'src/mixins/basic';

export default {
    name: 'Setting',

    mixins: [basic],

    data: () => ({
        username: '',
        password: '',

        showPassword: false,
    }),

    mounted() {
        this.$store.subscribe(async ({ type, payload }) => {
            if (type === 'user/login' && payload != null) {
                this.$router.go(-1);
            }
        });
    },

    methods: {
        async register() {
            try {
                this.$store.dispatch('user/register', {
                    username: this.username,
                    password: this.password,
                });
            } catch (e) {
                this.$q.notify(this.$t('login.' + camelCase(e.message)));
            }
        },

        async login() {
            try {
                this.$store.dispatch('user/login', {
                    username: this.username,
                    password: this.password,
                });
            } catch (e) {
                this.$q.notify(this.$t('login.' + camelCase(e.message)));
            }
        },

        async logout() {
            this.$store.dispatch('user/logout');
        },
    },
};
</script>

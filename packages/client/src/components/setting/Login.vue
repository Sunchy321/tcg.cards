<template>
    <q-form class="q-pa-md q-gutter-md">
        <q-input
            v-model="username"
            filled
            :label="$t('user.username')"
        />
        <q-input
            v-model="password"
            filled
            :type="showPassword ? 'text' : 'password'"
            :label="$t('user.password')"
            :hint="$t('user.passwordHint')"
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
                :label="$t('user.register')"
                @click="register"
            />
            <q-btn
                class="col q-ma-sm"
                color="primary"
                :label="$t('user.login')"
                @click="login"
            />
        </div>
    </q-form>
</template>

<script>
import { camelCase } from 'lodash';

export default {
    name: 'Login',

    data: () => ({
        username: '',
        password: '',

        showPassword: false,
    }),

    methods: {
        async register() {
            try {
                this.$store.dispatch('user/register', {
                    username: this.username,
                    password: this.password,
                });
            } catch (e) {
                this.$q.notify(this.$t('user.' + camelCase(e.message)));
            }
        },

        async login() {
            try {
                this.$store.dispatch('user/login', {
                    username: this.username,
                    password: this.password,
                });
            } catch (e) {
                this.$q.notify(this.$t('user.' + camelCase(e.message)));
            }
        },
    },
};
</script>

<style>

</style>

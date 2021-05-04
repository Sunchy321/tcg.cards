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
            <template #append>
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

<script lang="ts">
import { defineComponent, ref } from 'vue';

import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';

import { camelCase } from 'lodash';

export default defineComponent({
    name: 'Login',

    setup() {
        const quasar = useQuasar();
        const store = useStore();
        const i18n = useI18n();

        const username = ref('');
        const password = ref('');
        const showPassword = ref(false);

        const register = () => {
            try {
                void store.dispatch('user/register', {
                    username: username.value,
                    password: password.value,
                });
            } catch (e) {
                quasar.notify(i18n.t('user.' + camelCase(e.message)));
            }
        };

        const login = () => {
            try {
                void store.dispatch('user/login', {
                    username: username.value,
                    password: password.value,
                });
            } catch (e) {
                quasar.notify(i18n.t('user.' + camelCase(e.message)));
            }
        };

        return {
            username,
            password,
            showPassword,

            register,
            login,
        };
    },
});
</script>

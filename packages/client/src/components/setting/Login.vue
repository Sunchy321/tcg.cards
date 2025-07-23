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
                href="register"
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

<script setup lang="ts">
import { ref } from 'vue';

import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';

import { auth } from 'src/auth';

const quasar = useQuasar();
const i18n = useI18n();

const username = ref('');
const password = ref('');
const showPassword = ref(false);

const login = async () => {
    const user = await auth.signIn.username({
        username: username.value,
        password: password.value,
    });

    if (user.error != null) {
        quasar.notify({
            type:    'negative',
            message: i18n.t(`user.error.${user.error.code}`),
        });
    }
};
</script>

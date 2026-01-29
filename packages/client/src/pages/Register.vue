<template>
    <q-page class="register-background flex items-center justify-center">
        <q-card class="column register items-stretch">
            <q-input
                v-model="username"
                class="q-my-md"
                outlined
                autocomplete="username"
                :label="$t('user.username')"
                :rules="nameRules"
            />

            <q-input
                v-model="email"
                class="q-my-md"
                outlined
                :label="$t('user.email')"
                type="email"
                autocomplete="email"
                :rules="emailRules"
            />

            <password-input
                v-model="password"
                class="q-my-md"
                outlined
                autocomplete="new-password"
                :label="$t('user.password')"
                :rules="passwordRules"
            />

            <password-input
                v-model="repeatedPassword"
                class="q-my-md"
                outlined
                :label="$t('user.repeat-password')"
                :rules="repeatedPasswordRules"
            />

            <q-btn
                color="primary"
                :label="$t('user.register')"
                @click="register"
            />
        </q-card>
    </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { useQuasar, ValidationRule } from 'quasar';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

import PasswordInput from 'components/PasswordInput.vue';

import { sleep } from 'src/util';
import { auth } from '@/auth';

const quasar = useQuasar();
const router = useRouter();
const i18n = useI18n();

const username = ref('');
const email = ref('');
const password = ref('');
const repeatedPassword = ref('');

const register = async () => {
    if (password.value != repeatedPassword.value) {
        return;
    }

    const result = await auth.signUp.email({
        name:     username.value,
        email:    email.value,
        password: password.value,
        username: username.value,
    });

    if (result.error == null) {
        quasar.notify({
            type:    'positive',
            message: 'hi',
        });

        await sleep(1000);

        router.back();

        return;
    }

    console.log(result.error);
};

const nameRules = [
    val => !!val || i18n.t('user.error.REQUIRE_USERNAME'),
] satisfies ValidationRule[];

const emailRules = [
    val => !!val || i18n.t('user.error.REQUIRE_EMAIL'),
    val => /.+@.+\..+/.test(val) || i18n.t('user.error.INVALID_EMAIL'),
] satisfies ValidationRule[];

const passwordRules = [

] satisfies ValidationRule[];

const repeatedPasswordRules = [
    val => val == password.value || i18n.t('user.error.WRONG_REPEATED_PASSWORD'),
] satisfies ValidationRule[];

</script>

<style lang="sass" scoped>
.register-background
    background: linear-gradient(135deg, #1e88e5, #ffffff)
    min-height: 100vh
    width: 100%

.register
    width: 400px
    max-width: 90%
    padding: 30px
    border-radius: 8px
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1)

    @media (max-width: 600px)
        width: 90%
        padding: 20px

</style>

<template>
    <q-page class="flex justify-center q-pa-md">
        <template v-if="profile == null">
            <q-form class="login q-pa-md q-gutter-md">
                <q-input
                    v-model="username"
                    :label="$t('login.username')"
                />
                <q-input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    :label="$t('login.password')"
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
            <div class="left-panel col-4 flex column items-end q-pa-md">
                <div class="header q-pa-lg q-mb-md">
                    <div class="name">
                        {{ profile.username }}
                    </div>
                    <div class="role">
                        {{ $t('profile.role.' + profile.role) }}
                    </div>
                </div>
                <div class="action">
                    <q-btn
                        flat
                        :label="$t('profile.logout')"
                        @click="logout"
                    />
                </div>
            </div>
            <div class="body col">
            </div>
        </template>
    </q-page>
</template>

<style lang="stylus" scoped>

.login
    width 30%

.header
    border-radius 5px
    background-color lighten($primary, 20%)
    color white

.name
    font-size 120%

</style>

<script>
export default {
    name: 'Profile',

    data: () => ({
        username: '',
        password: '',

        showPassword: false
    }),

    computed: {
        profile() {
            return this.$store.getters.profile;
        }
    },

    methods: {
        async register() {
            const { data } = await this.user.post('/register', {
                username: this.username,
                password: this.password
            });

            if (data.failure == null) {
                this.$store.dispatch('login', data);
            } else {
                // TODO
                console.log(data.failure);
            }
        },

        async login() {
            const { data } = await this.user.post('/login', {
                username: this.username,
                password: this.password
            });

            if (data.failure == null) {
                this.$store.dispatch('login', data);
            } else {
                // TODO
                console.log(data.failure);
            }
        },

        async logout() {
            await this.user.post('/logout');

            this.$store.dispatch('logout');
        }
    }
};
</script>

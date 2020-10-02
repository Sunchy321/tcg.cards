<template>
    <q-page class="flex row">
        <aside class="left-panel col-3 flex column items-strech q-pa-md">
            <template v-if="profile == null">
                <q-form class="q-pa-md q-gutter-md">
                    <q-input
                        filled
                        v-model="username"
                        :label="$t('login.username')"
                    />
                    <q-input
                        filled
                        v-model="password"
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
                <div class="header flex column items-center q-pa-lg q-mb-md">
                    <div class="name">
                        {{ profile.username }}
                    </div>
                    <div class="role">
                        {{ $t('profile.role.' + profile.role) }}
                    </div>
                </div>
                <div class="action flex">
                    <q-btn
                        flat
                        :label="$t('profile.logout')"
                        @click="logout"
                    />
                </div>
            </template>
        </aside>
        <article class="body col">
        </article>
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
export default {
    name: 'Setting',

    data: () => ({
        username: '',
        password: '',

        showPassword: false
    }),

    mounted() {
        this.$store.subscribe(async (mutation) => {
            if (mutation.type === 'user' && mutation.payload != null) {
                const redirect = this.$route.query.redirect;

                if (redirect != null) {
                    this.$router.go(-1);
                }
            }
        });
    },

    computed: {
        profile() {
            return this.$store.getters.profile;
        }
    },

    methods: {
        isWeak(password) {
            if (password.length < 8) {
                return true;
            }

            if (
                !/\d/.test(password) ||
                !/[a-z]/.test(password) ||
                !/[A-Z]/.test(password) ||
                /[0-9a-zA-Z]/.test(password)
            ) {
                return true;
            }

            return false;
        },

        async register() {
            if (this.isWeak(this.password)) {
                this.$notify(this.$t('login.weakPassword'));
                return;
            }

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

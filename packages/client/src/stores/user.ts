import { defineStore } from 'pinia';

import { LocalStorage } from 'quasar';
import { jwtDecode } from 'jwt-decode';
import { computed, ref, watch } from 'vue';

import { user as userServer } from 'boot/backend';

export interface State {
    user: string | null;
}

export interface User {
    username: string;
    role: string;
}

export default {
    user: null,
};

interface UserPassPair {
    username: string;
    password: string;
}

interface UserOrError {
    token: string;
    error?: string;
}

function passwordValidator(password: string) {
    if (password.length < 8) {
        return 'password_too_short';
    }

    if (!/\d/.test(password)) {
        return 'password_no_digit';
    }

    if (!/[a-z]/.test(password)) {
        return 'password_no_lower_case';
    }

    if (!/[A-Z]/.test(password)) {
        return 'password_no_upper_case';
    }

    if (!/[^0-9a-zA-Z]/.test(password)) {
        return 'password_no_special_character';
    }

    return undefined;
}

export const useUser = defineStore('user', () => {
    const token = ref<string | null>(LocalStorage.getItem('user'));

    watch(token, () => {
        if (token.value != null) {
            LocalStorage.set('user', token.value);
        } else {
            LocalStorage.remove('user');
        }
    });

    const user = computed(() => {
        if (token.value == null) {
            return null;
        } else {
            return jwtDecode<User>(token.value);
        }
    });

    const loggedIn = computed(() => user.value != null);
    const isAdmin = computed(() => user.value?.role === 'admin');

    const refresh = async () => {
        if (token.value != null) {
            const { data } = await userServer.get<UserOrError>('/refresh', {
                headers: {
                    Authentication: `Bearer ${token.value}`,
                },
            });

            if (data.error == null) {
                token.value = data.token;
            } else {
                token.value = null;
            }
        }
    };

    const register = async ({ username, password }: UserPassPair) => {
        if (user.value != null) {
            throw new Error('already_logged_in');
        }

        const result = passwordValidator(password);

        if (result != null) {
            throw new Error(result);
        }

        const { data } = await userServer.post<UserOrError>('/register', { username, password });

        if (data.error == null) {
            token.value = data.token;
        } else {
            throw new Error(data.error);
        }
    };

    const login = async ({ username, password }: UserPassPair) => {
        if (user.value != null) {
            throw new Error('already_logged_in');
        }

        const { data } = await userServer.post<UserOrError>('/login', { username, password });

        if (data.error == null) {
            token.value = data.token;
        } else {
            throw new Error(data.error);
        }
    };

    const logout = () => { token.value = null; };

    return {
        token,
        user,
        loggedIn,
        isAdmin,

        refresh,
        register,
        login,
        logout,
    };
});

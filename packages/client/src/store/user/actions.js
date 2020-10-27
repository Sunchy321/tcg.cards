import { user } from 'src/boot/backend';

export async function refresh({ commit, getters }) {
    const token = getters.token;

    if (token != null) {
        const { data } = await user.get('/refresh', {
            headers: {
                Authentication: 'Bearer ' + token,
            },
        });

        if (data.error == null) {
            commit('user', data.token);
        } else {
            commit('user', null);
        }
    }
}

function passwordValidator(password) {
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
}

export async function register({ commit, getters }, { username, password }) {
    if (getters.user != null) {
        throw new Error('already_logged_in');
    }

    const result = passwordValidator(password);

    if (result != null) {
        throw new Error(result);
    }

    const { data } = await user.post('/register', { username, password });

    if (data.error == null) {
        commit('user', data.token);
    } else {
        throw new Error(data.error);
    }
}

export async function login({ commit, getters }, { username, password }) {
    if (getters.user != null) {
        throw new Error('already_logged_in');
    }

    const { data } = await user.post('/login', { username, password });

    if (data.error == null) {
        commit('user', data.token);
    } else {
        throw new Error(data.error);
    }
}

export async function logout({ commit }) {
    commit('user', null);
}

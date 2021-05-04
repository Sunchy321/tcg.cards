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

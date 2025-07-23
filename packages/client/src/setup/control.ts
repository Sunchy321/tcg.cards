import { controlBase, control } from 'boot/server';

import { AxiosResponse } from 'axios';

export default function controlSetup(): {
    controlGet:  <T>(url: string, params?: Record<string, any>) => Promise<AxiosResponse<T>>;
    controlPost: <T>(url: string, params?: Record<string, any>) => Promise<AxiosResponse<T>>;
    controlWs:   (url: string, params?: Record<string, any>) => WebSocket;
} {
    const user = {
        token: 'TOKEN_PLACEHOLDER', // Replace with actual token retrieval logic
    };

    async function controlGet<T>(path: string, params: Record<string, any> = { }) {
        const { token } = user;

        if (token != null) {
            return control.get<T>(path, {
                headers: {
                    Authentication: `Bearer ${token}`,
                },
                params,
            });
        } else {
            return control.get<T>(path, { params });
        }
    }

    async function controlPost<T>(path: string, params: Record<string, any> = { }) {
        const { token } = user;

        if (token != null) {
            return control.post<T>(path, params, {
                headers: {
                    Authentication: `Bearer ${token}`,
                },
            });
        } else {
            return control.post<T>(path, params);
        }
    }

    function controlWs(path: string, params: Record<string, any> = { }) {
        const { token } = user;

        params = token != null ? { jwt: token, ...params } : params;

        const url = new URL(path, controlBase.replace(/^http/, 'ws'));

        if (Object.keys(params).length !== 0) {
            url.search = new URLSearchParams(params).toString();
        }

        return new WebSocket(url.toString());
    }

    return { controlGet, controlPost, controlWs };
}

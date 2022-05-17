/* eslint-disable prefer-destructuring */
import { useUser } from 'store/user';

import { controlBase, control } from 'boot/backend';

import { AxiosResponse } from 'axios';

export default function controlSetup(): {
    controlGet: <T>(url: string, params?: Record<string, any>) => Promise<AxiosResponse<T>>;
    controlPost: <T>(url: string, params?: Record<string, any>) => Promise<AxiosResponse<T>>;
    controlWs: (url: string, params?: Record<string, any>) => WebSocket;
} {
    const user = useUser();

    async function controlGet<T>(path: string, params: Record<string, any> = { }) {
        const token = user.token;

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
        const token = user.token;

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
        const token = user.token;

        params = token != null ? { jwt: token, ...params } : params;

        const url = new URL(path, `wss://${controlBase}`);

        if (Object.keys(params).length !== 0) {
            url.search = new URLSearchParams(params).toString();
        }

        return new WebSocket(url.toString());
    }

    return { controlGet, controlPost, controlWs };
}

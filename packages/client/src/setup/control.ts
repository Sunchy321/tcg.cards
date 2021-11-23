import { useStore } from 'src/store';

import { controlBase, control } from 'boot/backend';

import { join } from 'path';

export default function controlSetup() {
    const store = useStore();

    function controlGet<T>(url: string, params: Record<string, any> = { }) {
        const token = store?.getters?.['user/token'];

        if (token != null) {
            return control.get<T>(url, {
                headers: {
                    Authentication: `Bearer ${token}`,
                },
                params,
            });
        } else {
            return control.get<T>(url, { params });
        }
    }

    function controlPost<T>(url: string, params: Record<string, any> = { }) {
        const token = store?.getters?.['user/token'];

        if (token != null) {
            return control.post<T>(url, params, {
                headers: {
                    Authentication: `Bearer ${token}`,
                },
            });
        } else {
            return control.post<T>(url, params);
        }
    }

    function controlWs(url: string, params: Record<string, any> = { }) {
        const token = store?.getters?.['user/token'];

        params = params || {};
        params = token != null ? { jwt: token, ...params } : params;

        if (Object.keys(params).length === 0) {
            return new WebSocket(`ws://${join(controlBase, url)}`);
        } else {
            return new WebSocket(`ws://${join(controlBase, url)}?${
                Object.entries(params).map(
                    ([k, v]) => `${k}=${encodeURIComponent(v)}`,
                ).join('&')
            }`);
        }
    }

    return { controlGet, controlPost, controlWs };
}

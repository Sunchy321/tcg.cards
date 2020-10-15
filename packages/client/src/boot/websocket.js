import { join } from 'path';

class WebsocketWarpper {
    constructor(prefix) {
        this.prefix = prefix;
    }

    create(url) {
        return new WebSocket('ws://' + join(this.prefix, url));
    }
}

export default async ({ Vue }) => {
    Vue.prototype.apiWs = new WebsocketWarpper(
        process.env.NODE_ENV === 'production' ? 'api.tcg.cards' : 'api.test.local:8889',
    );
};

import { boot } from 'quasar/wrappers';

declare module '@vue/runtime-core' {
    interface ComponentCustomProperties {
        $sleep: (_: number) => Promise<void>;
    }
}

export async function sleep(time: number) {
    return new Promise(resolve => { setTimeout(resolve, time); });
}

export default boot(({ app }) => {
    app.config.globalProperties.$sleep = sleep;
});

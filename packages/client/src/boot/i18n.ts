import { boot } from 'quasar/wrappers';

import { createI18n } from 'vue-i18n';
// import messages from '@intlify/unplugin-vue-i18n/messages';
import messages from 'src/i18n';

const i18n = createI18n({
    legacy:             false,
    locale:             'en',
    fallbackLocale:     'en',
    silentFallbackWarn: true,
    globalInjection:    true,
    messages,
});

export default boot(({ app }) => {
    app.use(i18n);
});

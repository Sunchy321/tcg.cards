<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script>
const quasarLocaleMap = {
    en:  'en-us',
    zhs: 'zh-hans',
};

export default {
    name: 'App',

    created() {
        this.$store.subscribe(async ({ type, payload: locale }) => {
            if (type === 'locale') {
                this.$i18n.locale = locale;

                const qLocaleId = quasarLocaleMap[locale] ||
                    locale.replace(/[A-Z]/, t => '-' + t.toLowerCase());

                const qLocale = await import('quasar/lang/' + qLocaleId);

                this.$q.lang.set(qLocale.default);
            }
        });

        this.$store.dispatch('boot');
    },
};
</script>

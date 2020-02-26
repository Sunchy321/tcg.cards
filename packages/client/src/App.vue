<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script>
const quasarLocaleMap = {
    enUS: 'en-us',
    zhCN: 'zh-hans'
};

export default {
    name: 'App',

    created() {
        this.$store.subscribe(async (mutation) => {
            if (mutation.type === 'locale/set') {
                const locale = mutation.payload;

                this.$i18n.locale = locale;

                const qLocale = await import(`quasar/lang/${
                    quasarLocaleMap[locale] ||
                    locale.replace(/[A-Z]/, t => '-' + t.toLowerCase())
                }`);

                this.$q.lang.set(qLocale.default);
            }
        });

        this.$store.dispatch('boot');
    }
};
</script>

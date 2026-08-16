export default defineNuxtConfig({
	extends: ['@tcg-cards/ui'],

	modules: ['@nuxt/eslint'],

	// Console apps do not use i18n; keep routes unprefixed to avoid locale route noise.
	i18n: {
		strategy: 'no_prefix',
		defaultLocale: 'en',
	},
});

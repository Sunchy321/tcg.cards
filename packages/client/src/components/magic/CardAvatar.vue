<style lang="sass">
.card-popover, [content-class=card-popover]
    background-color: transparent !important
    padding: 0 !important

.card-image-popover
    width: 250px
</style>

<script lang="ts">
import {
    PropType, defineComponent, ref, computed, watch, h,
} from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useMagic } from 'store/games/magic';

import { QTooltip } from 'quasar';
import CardImage from './CardImage.vue';

import cardProfile, { CardProfile } from 'src/common/magic/card';

import { pick } from 'lodash';

type Version = {
    set: string;
    number: string;
    lang: string;
};

export default defineComponent({
    components: { CardImage },

    props: {
        id:      { type: String, required: true },
        part:    { type: Number, default: undefined },
        version: { type: Object as PropType<Version>, default: undefined },
        useLang: { type: Boolean, default: false },
        pauper:  { type: Boolean, default: false },
        text:    { type: String, default: undefined },
    },

    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const magic = useMagic();

        const innerShowId = ref(false);
        const profile = ref<CardProfile | null>(null);

        const locale = computed(() => {
            if (props.useLang && props.version != null) {
                return props.version.lang;
            } else {
                return magic.locale;
            }
        });

        const link = computed(() => router.resolve({
            name:   'magic/card',
            params: { id: props.id },
            query:  {
                ...pick(props.version, ['set', 'number', 'lang']),
                ...props.part != null ? { part: props.part } : {},
            },
        }).href);

        const showId = computed(() => innerShowId.value || (profile.value == null && props.text == null));
        const onThisPage = computed(() => link.value === route.path);

        const name = computed(() => {
            if (profile.value == null) {
                return null;
            }

            const { locales } = magic;
            const defaultLocale = locales[0];

            return profile.value.parts.map(p => p.localization.find(l => l.lang === locale.value)?.name
                ?? p.localization.find(l => l.lang === defaultLocale)?.name ?? '').join(' // ');
        });

        const imageVersion = computed(() => {
            if (profile.value == null || profile.value.versions == null) {
                return null;
            }

            if (props.version != null) {
                const matchedVersion = profile.value.versions.find(v => v.set === props.version?.set
                    && v.number === props.version?.number
                    && v.lang === props.version?.lang);

                if (matchedVersion != null) {
                    return matchedVersion;
                }
            }

            if (props.pauper) {
                const versions = profile.value.versions.filter(v => v.rarity === 'common');

                const { locales } = magic;
                const defaultLocale = locales[0];

                const localeVersion = versions.filter(v => v.lang === locale.value);

                if (localeVersion.length > 0) {
                    return localeVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0))[0];
                }

                const defaultVersion = versions.filter(v => v.lang === defaultLocale);

                if (defaultVersion.length > 0) {
                    return defaultVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0))[0];
                }

                if (versions.length > 0) {
                    return versions.sort((a, b) => (a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0))[0];
                }
            }

            const { versions } = profile.value;

            const { locales } = magic;
            const defaultLocale = locales[0];

            const localeVersion = versions.filter(v => v.lang === locale.value);

            if (localeVersion.length > 0) {
                return localeVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                    ? -1
                    : a.releaseDate < b.releaseDate ? 1 : 0))[0];
            }

            const defaultVersion = versions.filter(v => v.lang === defaultLocale);

            if (defaultVersion.length > 0) {
                return defaultVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                    ? -1
                    : a.releaseDate < b.releaseDate ? 1 : 0))[0];
            }

            return versions.slice().sort((a, b) => (a.releaseDate > b.releaseDate
                ? -1
                : a.releaseDate < b.releaseDate ? 1 : 0))[0];
        });

        const loadData = async () => cardProfile.get(
            props.id,
            v => { profile.value = v; },
        ).catch(() => { innerShowId.value = true; });

        watch(() => props.id, loadData, { immediate: true });

        return () => {
            const text = showId.value
                ? h('span', { class: 'code' }, props.id)
                : h('span', props.text ?? name.value ?? '');

            if (onThisPage.value) {
                return text;
            } else {
                return h(RouterLink, {
                    to:     link.value,
                    target: '_blank',
                }, () => {
                    const children = [text];

                    if (profile.value != null && imageVersion.value != null) {
                        children.push(h(QTooltip, {
                            'content-class': 'card-popover',
                        }, () => [h(CardImage, {
                            class:  'card-image-popover',
                            lang:   imageVersion.value!.lang,
                            set:    imageVersion.value!.set,
                            number: imageVersion.value!.number,
                            layout: imageVersion.value!.layout,
                            part:   props.part,
                        })]));
                    }

                    return children;
                });
            }
        };
    },
});
</script>

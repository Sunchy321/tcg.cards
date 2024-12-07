<script lang="ts">
import {
    defineComponent, ref, computed, watch, h,
} from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import { QTooltip, QImg } from 'quasar';

import cardProfile, { CardProfile } from 'src/common/hearthstone/card';

import { imageBase } from 'boot/backend';

export default defineComponent({
    props: {
        cardId:  { type: String, required: true },
        format:  { type: String, default: undefined },
        version: { type: Number, default: 0 },
        text:    { type: String, default: undefined },
    },

    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const hearthstone = useHearthstone();

        const innerShowId = ref(false);
        const profile = ref<CardProfile | null>(null);

        const link = computed(() => router.resolve({
            name:   'hearthstone/card',
            params: { id: props.cardId },
            query:  {
                version: props.version,
            },
        }).href);

        const showId = computed(() => innerShowId.value || (profile.value == null && props.text == null));
        const onThisPage = computed(() => link.value === route.path);

        const name = computed(() => {
            if (profile.value == null) {
                return null;
            }

            const { locales, locale } = hearthstone;
            const defaultLocale = locales[0];

            const localizations = profile.value.localization;

            const localization = localizations.find(l => l.lang === locale)
                ?? localizations.find(l => l.lang === defaultLocale)
                ?? localizations[0];

            return localization.name;
        });

        const imageUrl = computed(() => {
            const url = new URL('/hearthstone/card', imageBase);

            const params: any = { };

            params.id = props.cardId;
            params.lang = hearthstone.locale;

            if (props.version !== 0) {
                params.version = props.version;
            }

            if (props.format != null) {
                params.format = props.format;
            }

            url.search = new URLSearchParams(params).toString();

            return url.toString();
        });

        const loadData = async () => cardProfile.get(
            props.cardId,
            v => { profile.value = v; },
        ).catch(() => { innerShowId.value = true; });

        watch(() => props.cardId, loadData, { immediate: true });

        return () => {
            const text = showId.value
                ? h('span', { class: 'code' }, props.cardId)
                : h('span', props.text ?? name.value ?? '');

            if (onThisPage.value) {
                return text;
            } else {
                return h(RouterLink, {
                    to:     link.value,
                    target: '_blank',
                }, () => {
                    const children = [text];

                    if (profile.value != null) {
                        children.push(h(QTooltip, {
                            'content-class': 'card-popover',
                        }, () => [h(QImg, {
                            class: 'card-image-popover',
                            src:   imageUrl.value,
                        })]));
                    }

                    return children;
                });
            }
        };
    },
});
</script>

<style lang="sass">
.card-popover, [content-class=card-popover]
    background-color: transparent !important
    padding: 0 !important

.card-image-popover
    width: 250px
</style>

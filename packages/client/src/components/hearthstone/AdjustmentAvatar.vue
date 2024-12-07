<script lang="ts">
import {
    PropType, defineComponent, ref, computed, watch, h,
} from 'vue';

import { useRouter, RouterLink } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import { QTooltip, QImg } from 'quasar';

import { Adjustment } from 'interface/hearthstone/format-change';

import cardProfile, { CardProfile } from 'src/common/hearthstone/card';

import { imageBase } from 'boot/backend';

type PartAdjustment = {
    part: string;
    status: Adjustment;
};

export default defineComponent({
    props: {
        cardId:      { type: String, required: true },
        format:      { type: String, default: undefined },
        version:     { type: Number, required: true },
        lastVersion: { type: Number, required: true },
        text:        { type: String, default: undefined },
        adjustment:  {
            type:     Array as PropType<{ id?: string, detail: PartAdjustment[] }[]>,
            required: true,
        },
    },

    setup(props) {
        const router = useRouter();
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

        const imageUrl = (id: string, version: number, adjustment: PartAdjustment[]) => {
            const url = new URL('/hearthstone/card', imageBase);

            const params: any = { };

            params.id = id;
            params.lang = hearthstone.locale;

            if (props.format != null) {
                params.format = props.format;
            }

            if (version !== 0) {
                params.version = version;
            }

            if (adjustment.length > 0) {
                params.adjustment = adjustment.map(a => `${a.part}:${a.status}`).join(',');
            }

            url.search = new URLSearchParams(params).toString();

            return url.toString();
        };

        const mainPart = computed(() => {
            const adj = props.adjustment.find(v => v.id == null);

            if (adj == null) {
                return [
                    imageUrl(props.cardId, props.version, []),
                ];
            } else {
                return [
                    imageUrl(props.cardId, props.lastVersion, []),
                    imageUrl(props.cardId, props.version, adj.detail),
                ];
            }
        });

        const relatedPart = computed(() => props.adjustment
            .filter(v => v.id != null)
            .map(a => [
                imageUrl(a.id!, props.lastVersion, []),
                imageUrl(a.id!, props.version, a.detail),
            ]));

        const loadData = async () => cardProfile.get(
            props.cardId,
            v => { profile.value = v; },
        ).catch(() => { innerShowId.value = true; });

        watch(() => props.cardId, loadData, { immediate: true });

        return () => {
            const text = showId.value
                ? h('span', { class: 'code' }, props.cardId)
                : h('span', props.text ?? name.value ?? '');

            return h(RouterLink, {
                to:     link.value,
                target: '_blank',
            }, () => {
                const children = [text];

                if (profile.value != null) {
                    children.push(h(QTooltip, {
                        'content-class': 'adjustment-popover',
                    }, () => [h('div', { class: 'flex items-center flex-nowarp' }, [
                        [mainPart.value, ...relatedPart.value].map(urls => {
                            if (urls.length === 1) {
                                return h(QImg, { class: 'adjustment-image-popover', src: urls[0] });
                            } else {
                                return h('span', { class: 'flex items-center' }, [
                                    h(QImg, { class: 'adjustment-image-popover', src: urls[0] }),
                                    h('img', { class: 'adjustment-arrow', src: '/hearthstone/right-arrow.png' }),
                                    h(QImg, { class: 'adjustment-image-popover', src: urls[1] }),
                                ]);
                            }
                        }),
                    ])]));
                }

                return children;
            });
        };
    },
});
</script>

<style lang="sass">
.adjustment-popover, [content-class=adjustment-popover]
    background-color: transparent !important
    padding: 0 !important

.adjustment-image-popover
    width: 150px

.adjustment-arrow
    width: 30px
</style>

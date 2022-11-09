<style lang="sass" scoped>
.set-id
    color: #777

</style>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, h,
} from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import setProfile, { SetProfile } from 'src/common/hearthstone/set';

export default defineComponent({
    props: {
        id:   { type: String, required: true },
        text: { type: String, default: undefined },
    },

    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const hearthstone = useHearthstone();

        const innerShowId = ref(false);
        const profile = ref<SetProfile | null>(null);

        const link = computed(() => router.resolve({
            name:   'magic/set',
            params: { id: props.id },
        }).href);

        const onThisPage = computed(() => link.value === route.path);

        const name = computed(() => {
            if (profile.value == null) {
                return null;
            }

            const { locales, locale } = hearthstone;
            const defaultLocale = locales[0];

            const { localization } = profile.value;

            return localization[locale]?.name ?? localization[defaultLocale]?.name ?? props.id;
        });

        const loadData = async () => setProfile.get(
            props.id,
            v => { profile.value = v; },
        ).catch(() => { innerShowId.value = true; });

        watch(() => props.id, loadData, { immediate: true });

        return () => {
            const text = props.text ?? name.value;

            const children = [h('span', { class: 'code set-id q-ml-sm' }, props.id)];

            if (text != null) {
                const textSpan = h('span', text);

                if (onThisPage.value) {
                    children.unshift(textSpan);
                } else {
                    children.unshift(h(RouterLink, {
                        to:     link.value,
                        target: '_blank',
                    }, () => [textSpan]));
                }
            }

            return h('div', children);
        };
    },
});
</script>

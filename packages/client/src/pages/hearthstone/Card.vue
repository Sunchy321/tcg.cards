<template>
    <q-page class="main q-pa-md">
        <div class="image-column">
            <q-img :src="imageUrl" />
        </div>
        <div class="info-column">
            <div class="name-line row items-center">
                <div v-if="name != null" class="name">
                    {{ name }}
                </div>

                <q-space />

                <div v-if="hasCost" class="cost">
                    <!-- <img class="cost-image" :src="costImage">
                    <div class="cost-text">{{ cost }}</div> -->
                    {{ cost }}
                </div>
            </div>
            <div class="stats-line">
                <div v-if="type != null" class="type">{{ $t('hearthstone.card.type.' + type) }}</div>
                <div v-if="race != null" class="race">{{ $t('hearthstone.card.race.' + race) }}</div>
                <div v-if="stats != null" class="stats">{{ stats }}</div>
            </div>
            <div v-if="text != null" class="text">
                <hearthstone-text disable-newline>{{ text }}</hearthstone-text>
            </div>
            <div v-if="mechanics.length > 0 || referencedTags.length > 0" class="mechanics">
                <q-chip
                    v-for="m in mechanics" :key="m"
                    class="q-mr-sm q-ma-none"
                    square
                    size="12px"
                    color="primary"
                    text-color="white"
                >
                    {{ mechanicText(m) }}
                </q-chip>

                <q-chip
                    v-for="r in referencedTags" :key="r"
                    class="q-mr-sm q-ma-none"
                    square
                    size="12px"
                    color="secondary"
                    text-color="white"
                >
                    {{ mechanicText(r) }}
                </q-chip>
            </div>
            <div class="links flex q-gutter-md">
                <!-- <q-btn
                    v-if="scryfallLink != null"
                    class="link"
                    :href="scryfallLink" target="_blank"
                    outline no-caps
                >
                    <q-icon name="mdi-open-in-new" size="14px" class="q-mr-sm" />
                    Scryfall
                </q-btn>

                <q-btn
                    v-if="gathererLink != null"
                    class="link"
                    :href="gathererLink" target="_blank"
                    outline no-caps
                >
                    <q-icon name="mdi-open-in-new" size="14px" class="q-mr-sm" />
                    Gatherer
                </q-btn> -->

                <q-btn
                    v-if="jsonLink != null"
                    class="link"
                    :href="jsonLink" target="_blank"
                    outline no-caps
                >
                    <q-icon name="mdi-open-in-new" size="14px" class="q-mr-sm" />
                    JSON
                </q-btn>

                <q-btn
                    v-if="compareLink != null"
                    class="link"
                    :href="compareLink" target="_blank"
                    outline no-caps
                >
                    <q-icon name="mdi-vector-difference" size="14px" class="q-mr-sm" />
                    Compare
                </q-btn>
            </div>
        </div>
        <div class="version-column">
            <div class="version-block">
                <div v-for="(v, i) of versions" :key="i" class="version-line">
                    <div
                        class="version-dot"
                        :class="{ current: v.includes(version) }"
                    />
                    <div v-ripple @click="version = v[0]">
                        <template v-if="v.length === 1">
                            <div>{{ v[0] }}</div>
                        </template>
                        <template v-else>
                            <div>{{ v[0] }}</div>
                            <div>{{ v[v.length - 1] }}</div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.main
    display: flex
    flex-wrap: wrap

@media (max-width: 599px)
    .image-column
        flex: 0 0 100%

    .info-column
        flex: 0 0 100%
        padding: 16px 0

    .version-column
        flex: 0 0 100%

@media (min-width: 600px) and (max-width: 1023px)
    .image-column
        flex: 0 0 350px

    .info-column
        flex: 0 0 calc(100% - 350px)
        padding-left: 16px

    .version-column
        flex: 0 0 100%

@media (min-width: 1023px)
    .image-column
        flex: 0 0 350px

    .info-column
        flex: 1 1 0px
        padding: 0 16px

    .version-column
        flex: 0 0 300px

.name-line
    display: flex
    align-items: center

    @media (max-width: 599px)
        font-size: 150%

    @media (min-width: 600px)
        font-size: 200%

.stats-line
    margin-top: 10px
    display: flex
    align-items: center

.text, .mechanics
    margin-top: 30px

.type
    margin-right: 5px

.race
    margin-right: 5px

.mechanic, .referenced-tag
    display: inline-block

    padding: 2px
    margin-right: 5px
    margin-bottom: 5px

    border-width: 1px
    border-style: solid
    border-radius: 5px

.links
    margin-top: 30px

.link
    width: 150px

.version-block
    margin-top: 10px

    border: 1px solid $primary
    border-radius: 5px

.version-line
    position: relative
    padding: 5px
    padding-left: 10px

    &:not(:first-child)
        border-top: 1px solid $primary

    cursor: pointer

.version-dot
    width: 10px
    height: 10px
    border-radius: 100px
    border: 1px $primary solid

    background-color: white

    &.current
        background-color: $primary

    position: absolute
    left: -5px
    top: 50%
    transform: translateY(-50%)

</style>

<script lang="ts">
import {
    defineComponent, ref, computed, watch,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';
import { useI18n } from 'vue-i18n';

import hearthstoneSetup from 'setup/hearthstone';
import pageSetup from 'setup/page';

import HearthstoneText from 'components/hearthstone/Text.vue';

import { Entity } from 'interface/hearthstone/entity';

import { omitBy } from 'lodash';

import { apiBase, apiGet, imageBase } from 'boot/backend';

type Data = Entity & {
    versions: number[][];
};

export default defineComponent({
    name: 'Card',

    components: {
        HearthstoneText,
    },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const hearthstone = useHearthstone();
        const i18n = useI18n();

        const { random } = hearthstoneSetup();

        const data = ref<Data | null>(null);

        // data fields
        const id = computed(() => data.value?.cardId ?? route.params.id);

        const versions = computed(() => data.value?.versions ?? []);

        const version = computed({
            get() {
                const queryVersion = Number.parseInt(route.query.version as string, 10);

                if (!Number.isNaN(queryVersion)) {
                    if (data.value == null || versions.value.some(v => v.includes(queryVersion))) {
                        return queryVersion;
                    }
                }

                if (data.value != null) {
                    return data.value.version[0];
                }

                return 0;
            },
            set(newValue: number) {
                void router.replace({ query: { ...route.query, version: newValue } });
            },
        });

        const localization = computed(() => {
            const loc = data.value?.localization;

            if (loc == null) {
                return undefined;
            }

            return loc.find(l => l.lang === hearthstone.locale)
                ?? loc.find(l => l.lang === hearthstone.locales[0])
                ?? loc[0];
        });

        const name = computed(() => localization.value?.name);

        pageSetup({
            title: () => name.value ?? '',

            titleType: 'input',

            actions: [
                {
                    action:  'random',
                    icon:    'mdi-shuffle-variant',
                    handler: random,
                },
            ],
        });

        const hasCost = computed(() => {
            if (data.value?.cost == null) {
                return false;
            }

            return true;
        });

        const cost = computed(() => data.value?.cost ?? 0);

        const type = computed(() => data.value?.cardType);
        const race = computed(() => data.value?.race);

        const stats = computed(() => {
            const c = data.value;

            if (c == null) { return null; }
            if (c.attack != null && c.health != null) { return `${c.attack}/${c.health}`; }
            if (c.attack != null && c.durability != null) { return `${c.attack}/${c.durability}`; }
            if (c.armor != null) { return `[${c.armor}]`; }
            if (c.colddown != null) { return `#${c.colddown}`; }

            return null;
        });

        const text = computed(() => localization.value?.displayText);

        const mechanics = computed(() => (data.value?.mechanics ?? []).filter(
            v => !v.startsWith('?') && !/_\d(:\d+)?$/.test(v),
        ));

        const referencedTags = computed(() => (data.value?.referencedTags ?? []).filter(v => !v.startsWith('?')));

        const imageUrl = computed(() => {
            if (version.value !== 0) {
                return `https://${imageBase}/hearthstone/card?id=${id.value}&lang=${hearthstone.locale}&version=${version.value}`;
            } else {
                return `https://${imageBase}/hearthstone/card?id=${id.value}&lang=${hearthstone.locale}`;
            }
        });

        const apiQuery = computed(() => (route.params.id == null ? null : omitBy({
            id:      route.params.id as string,
            version: route.query.version as string,
        }, v => v == null)));

        const jsonLink = computed(() => {
            const url = new URL('hearthstone/card', `https://${apiBase}`);

            const query = apiQuery.value;

            if (query != null) {
                url.search = new URLSearchParams(query).toString();
            }

            return url.toString();
        });

        const compareLink = computed(() => {
            if (versions.value.length < 2) {
                return null;
            }

            const url = new URL('hearthstone/card/compare', `https://${apiBase}`);

            const index = versions.value.findIndex(v => v.includes(version.value));

            const anotherIndex = index === versions.value.length - 1 ? index - 1 : index + 1;

            const anotherVersion = versions.value[anotherIndex];

            const query = {
                id: route.params.id,
                lv: anotherVersion[0].toString(),
                rv: version.value.toString(),
            } as Record<string, string>;

            url.search = new URLSearchParams(query).toString();

            return url.toString();
        });

        // methods
        const loadData = async () => {
            const query = omitBy({
                id:      route.params.id,
                version: route.query.version,
            }, v => v == null);

            const { data: result } = await apiGet<Data>('/hearthstone/card', query);

            data.value = result;
        };

        const mechanicText = (m: string) => {
            if (m.includes(':')) {
                const [mid, arg] = m.split(':');

                return `${i18n.t(`hearthstone.card.mechanic.${mid}`)}:${arg}`;
            } else {
                return i18n.t(`hearthstone.card.mechanic.${m}`);
            }
        };

        // watches
        watch(
            [() => route.params.id, () => route.query.version],
            loadData,

            { immediate: true },
        );

        return {
            versions,
            version,
            name,
            hasCost,
            cost,
            type,
            race,
            stats,
            text,
            mechanics,
            referencedTags,
            imageUrl,

            jsonLink,
            compareLink,

            mechanicText,

        };
    },
});
</script>

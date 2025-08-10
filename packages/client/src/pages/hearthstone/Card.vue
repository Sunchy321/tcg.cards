<template>
    <q-page class="main q-pa-md">
        <div class="image-column">
            <card-image
                v-if="data != null"
                :id="id"
                :version="minVersion"
                :variant="variant"
            />

            <div class="column items-center">
                <q-select
                    v-model="variant"
                    flat dense outlined
                    emit-value map-options
                    :options="variantOptions"
                />
            </div>

            <div class="q-mt-md column items-center">{{ artist }}</div>
        </div>
        <div class="info-column">
            <div class="name-line row items-center">
                <div v-if="name != null" class="name">
                    {{ name }}
                </div>

                <q-space />

                <div v-if="hasCost" class="cost">
                    {{ cost }}
                </div>
            </div>
            <div class="stats-line">
                <div v-if="type != null" class="type">{{ $t('hearthstone.card.type.' + type) }}</div>
                <div v-if="race != null" class="race">
                    {{ race.map(r => $t('hearthstone.card.race.' + r)).join('/') }}
                </div>
                <div v-if="stats != null" class="stats">{{ stats }}</div>
            </div>
            <div v-if="text != null" class="text">
                <rich-text disable-newline>{{ text }}</rich-text>
            </div>
            <div v-if="flavorText != null" class="flavor-text">
                <rich-text disable-newline>{{ flavorText }}</rich-text>
            </div>
            <div v-if="mechanics.length > 0 || referencedTags.length > 0" class="mechanics">
                <q-chip
                    v-for="m in mechanics" :key="m"
                    class="q-mr-sm q-mb-sm"
                    square
                    size="12px"
                    color="primary"
                    text-color="white"
                    clickable
                    @click="copyTag(m)"
                >
                    {{ mechanicText(m) }}
                </q-chip>

                <q-chip
                    v-for="r in referencedTags" :key="r"
                    class="q-mr-sm q-mb-sm"
                    square
                    size="12px"
                    color="secondary"
                    text-color="white"
                    clickable
                    @click="copyTag(r)"
                >
                    {{ mechanicText(r) }}
                </q-chip>
            </div>
            <div class="links flex q-gutter-md">
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
            <div v-if="relatedCards.length > 0" class="related-card-block">
                <div v-for="r in relatedCards" :key="r.cardId" class="related-card q-pl-md">
                    <q-icon :name="relationIcon(r.relation)" />
                    <card-avatar class="q-ml-sm" :card-id="r.cardId" :version="r.version[0]" />
                </div>
            </div>

            <div class="version-block">
                <div v-for="(v, i) of versionInfos" :key="i" class="version-line">
                    <div
                        class="version-dot"
                        :class="{ current: v.versions.includes(version) }"
                    />
                    <div v-ripple @click="version = v.versions[0]">
                        <template v-if="v.versions.length === 1">
                            <div>{{ v.firstName }}</div>
                        </template>
                        <template v-else>
                            <div>{{ v.firstName }}</div>
                            <div>{{ v.lastName }}</div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useCore, useTitle } from 'store/core';
import { useGame } from 'store/games/hearthstone';

import hearthstoneSetup from 'setup/hearthstone';

import RichText from 'src/components/hearthstone/RichText.vue';
import CardAvatar from 'components/hearthstone/CardAvatar.vue';
import CardImage from 'components/hearthstone/CardImage.vue';

import { Patch } from '@model/hearthstone/schema/patch';
import { CardFullView } from '@model/hearthstone/schema/entity';

import { last, omitBy } from 'lodash';
import { copyToClipboard, Notify } from 'quasar';

import { apiBase } from 'boot/server';
import { getValue, trpc } from 'src/hono';

const router = useRouter();
const route = useRoute();
const i18n = useI18n();
const core = useCore();
const game = useGame();

const { search, random } = hearthstoneSetup();

const data = ref<CardFullView>();
const patchProfiles = ref<Record<number, Patch>>({});

// data fields
const id = computed(() => data.value?.cardId ?? route.params.id as string);

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
            const lastVersion = Math.max(...data.value.version);

            const lastVersions = versions.value.find(v => v.includes(lastVersion)) ?? [];

            return lastVersions[0] ?? 0;
        }

        return 0;
    },
    set(newValue: number) {
        void router.replace({ query: { ...route.query, version: newValue } });
    },
});

const minVersion = computed(() => Math.min(...data.value?.version ?? []));

watch(versions, async values => {
    patchProfiles.value = {};

    for (const version of values) {
        for (const s of [version[0], last(version)!]) {
            const value = await getValue(trpc.hearthstone.patch.full, {
                buildNumber: s.toString(),
            });

            if (value != null) {
                patchProfiles.value[s] = value as Patch;
            }
        }
    }
}, { immediate: true });

const versionInfos = computed(() => versions.value.map(v => {
    const firstVersion = v[0];
    const lastVersion = last(v)!;

    const firstProfile = patchProfiles.value[firstVersion];
    const lastProfile = patchProfiles.value[lastVersion];

    const name = (profile: Patch | undefined, number: number) => {
        if (profile?.shortName != null) {
            return `${profile.shortName} (${number})`;
        } else {
            return `${number}`;
        }
    };

    return {
        versions:  v,
        firstName: name(firstProfile, firstVersion),
        lastName:  name(lastProfile, lastVersion),
    };
}));

const localization = computed(() => data.value?.localization);

const name = computed(() => localization.value?.name);

useTitle(() => name.value ?? '');

core.titleType = 'input';

core.actions = [
    {
        action:  'search',
        handler: search,
    },
    {
        action:  'random',
        icon:    'mdi-shuffle-variant',
        handler: random,
    },
];

const hasCost = computed(() => {
    if (data.value?.cost == null) {
        return false;
    }

    return true;
});

const cost = computed(() => data.value?.cost ?? 0);

const type = computed(() => data.value?.type);
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

const flavorText = computed(() => localization.value?.flavorText);

const artist = computed(() => data.value?.artist ?? '');

const mechanics = computed(() => (data.value?.mechanics ?? []).filter(v => !v.startsWith('?')));
const referencedTags = computed(() => (data.value?.referencedTags ?? []).filter(v => !v.startsWith('?')));
const relatedCards = computed(() => data.value?.relatedCards ?? []);

const hasTechLevel = computed(() => data.value?.techLevel != null);

const variant = ref('normal');

const variantOptions = computed(() => {
    const options = [
        { label: i18n.t('hearthstone.card.variant.normal'), value: 'normal' },
        { label: i18n.t('hearthstone.card.variant.golden'), value: 'golden' },
    ];

    if (mechanics.value.includes('has_diamond')) {
        options.push({ label: i18n.t('hearthstone.card.variant.diamond'), value: 'diamond' });
    }

    if (mechanics.value.includes('has_signature')) {
        options.push({ label: i18n.t('hearthstone.card.variant.signature'), value: 'signature' });
    }

    if (hasTechLevel.value) {
        options.push({ label: i18n.t('hearthstone.card.variant.battlegrounds'), value: 'battlegrounds' });
    }

    return options;
});

watch(hasTechLevel, () => {
    if (!hasTechLevel.value) {
        variant.value = 'normal';
    }
}, { immediate: true });

const apiQuery = computed(() => (route.params.id == null
    ? null
    : omitBy({
        id:      route.params.id as string,
        version: route.query.version as string,
    }, v => v == null)));

const jsonLink = computed(() => {
    const url = new URL('hearthstone/entity', apiBase);

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

    const url = new URL('hearthstone/entity/compare', apiBase);

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

    const value = await getValue(trpc.hearthstone.card.full, {
        cardId:  query.id as string,
        lang:    query.lang ?? game.locale,
        version: query.version as string,
    });

    if (value != null) {
        data.value = value as CardFullView;
    }
};

const mechanicText = (m: string) => {
    if (m.includes(':')) {
        const [mid, arg] = m.split(':');

        return `${i18n.t(`hearthstone.tag.${mid}`)}:${arg}`;
    } else {
        return i18n.t(`hearthstone.tag.${m}`);
    }
};

const copyTag = async (tag: string) => {
    const tagName = /^[^:]+(:|$)/.exec(tag)![0];

    console.log(tagName);

    await copyToClipboard(tagName);

    Notify.create(i18n.t('hearthstone.ui.entity.copy-tag'));
};

const relationIcon = (relation: string) => ({
    emblem:         'mdi-shield-outline',
    intext:         'mdi-card-search-outline',
    meld:           'mdi-circle-half-full',
    specialization: 'mdi-arrow-decision mdi-rotate-90',
    spellbook:      'mdi-book-open-page-variant-outline',
    source:         'mdi-file-tree-outline',
    stick_on:       'mdi-card-multiple',
    token:          'mdi-shape-outline',
})[relation] ?? 'mdi-cards-outline';

// watches
watch(
    [() => route.params.id, () => route.query.version],
    loadData,

    { immediate: true },
);
</script>

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

.text, .flavor-text, .mechanics
    margin-top: 30px

.flavor-text
    font-style: italic

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

.related-card-block
    margin-top: 10px

    border: 1px solid $primary
    border-radius: 5px

.related-card
    padding: 5px
    padding-left: 8px

    &:not(:first-child)
        border-top: 1px solid $primary

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

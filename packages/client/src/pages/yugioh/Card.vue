<template>
    <q-page class="main q-pa-md">
        <div class="image-column">
            <card-image
                v-if="data != null"
                v-model:rotate="rotate"
                :card-id="cardId"
                :passcode="passcode"
                :lang="imageLang"
                :set="set"
                :number="number"
                :layout="layout"
            />
        </div>

        <div class="info-column">
            <div class="name-line row items-center" :class="effectClass">
                <div class="name" :lang="langWithMode">
                    {{ name }}
                </div>

                <q-space />

                <q-img v-if="attribute != null" :src="`/yugioh/attribute/${attribute}.svg`" class="attribute" />
            </div>
            <div class="stats-line" :class="effectClass">
                <span class="typeline" :lang="langWithMode">{{ typeline }}</span>
                <span v-if="stats != null" class="other-stats">{{ stats }}</span>
            </div>
            <div class="ability auto-align" :class="effectClass" :lang="langWithMode">
                <rich-text>{{ text }}</rich-text>
            </div>

            <grid
                v-slot="v"
                :value="Object.entries(legalities)" :item-width="160"
                class="legalities"
            >
                <div class="flex items-center no-wrap">
                    <banlist-icon class="q-mr-sm" :status="v[1]" />
                    <span style="white-space: nowrap;"> {{ $t('yugioh.format.' + v[0]) }}</span>
                </div>
            </grid>

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
                    v-if="jsonPrintLink != null"
                    class="link"
                    :href="jsonPrintLink" target="_blank"
                    outline no-caps
                >
                    <q-icon name="mdi-open-in-new" size="14px" class="q-mr-sm" />
                    JSON(Print)
                </q-btn>
            </div>
        </div>

        <div class="version-column">
            <div class="text-mode row no-wrap">
                <q-btn
                    v-if="isAdmin"
                    :to="editorLink"
                    icon="mdi-file-edit"
                    class="q-mr-sm"
                    dense flat round
                />

                <q-btn-toggle
                    v-model="textMode"
                    class="col-grow"
                    :options="textModeOptions"
                    toggle-color="primary"
                    outline spread
                />
            </div>

            <div class="lang-line flex justify-center">
                <div class="col-auto">
                    <q-btn
                        v-for="i in langInfos" :key="i.lang"
                        class="lang-selector"
                        dense
                        size="sm"
                        :color="i.exist ? 'primary' : 'grey'"
                        :outline="!i.current"
                        :unelevated="i.current"
                        :label="i.lang"
                        @click="lang = i.lang"
                    />
                </div>
            </div>

            <div v-if="relatedCards.length > 0" class="related-card-block">
                <div v-for="r in relatedCards" :key="r.cardId" class="related-card q-pl-md">
                    <q-icon :name="relationIcon(r.relation)" />
                    <card-avatar :id="r.cardId" class="q-ml-sm" :version="r.version" />
                </div>
            </div>

            <div class="set-block">
                <div v-for="i in setInfos" :key="i.set" class="set-line">
                    <div
                        v-if="i.langs.includes(lang)"
                        class="set-dot" :class="{ current: i.set === set }"
                    />
                    <div>
                        <div v-ripple class="flex no-wrap items-center" @click="set = i.set">
                            <span class="code q-mr-sm" :style="`width: ${setMaxWidth}ch;`">{{ i.set }}</span>
                            <span class="set-name">{{ i.name }}</span>

                            <span class="rarity">{{ i.rarity[0] }}</span>
                        </div>
                        <div>
                            <q-btn
                                v-for="n of i.numbers" :key="n.number"
                                flat dense
                                size="xs"
                                :disable="set !== i.set || number === n.number || !n.langs.includes(lang)"
                                :color="n.langs.includes(lang) ? 'primary' : 'grey'"
                                :outline="number === n.number"
                                :label="n.number"
                                @click="number = n.number"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAction, useTitle } from 'store/core';
import { useGame, TextMode, textModes } from 'store/games/yugioh';

import basicSetup from 'setup/basic';
import yugiohSetup from 'setup/yugioh';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/yugioh/CardAvatar.vue';
import CardImage from 'components/yugioh/CardImage.vue';
import RichText from 'src/components/yugioh/RichText.vue';
import BanlistIcon from 'components/yugioh/BanlistIcon.vue';

import { CardPrintView } from '@common/model/yugioh/card';

import {
    mapValues, omitBy, uniq,
} from 'lodash';

import setProfile, { SetProfile } from 'src/common/yugioh/set';
import { apiGet, apiBase } from 'boot/server';

import { locales } from '@static/yugioh/basic';

const router = useRouter();
const route = useRoute();
const game = useGame();
const i18n = useI18n();
const { isAdmin } = basicSetup();

const { search, random } = yugiohSetup();

const data = ref<CardPrintView>();
const rotate = ref<boolean | null>(null);
const setProfiles = ref<Record<string, SetProfile>>({});

const textMode = computed({
    get() { return game.textMode; },
    set(newValue: TextMode) { game.textMode = newValue; },
});

const textModeOptions = computed(() => textModes.map(v => ({
    value: v,
    label: i18n.t(`yugioh.card.text-mode.${v}`),
})));

// data fields
const id = computed(() => data.value?.cardId ?? route.params.id as string);
const versions = computed(() => data.value?.versions ?? []);

const sets = computed(() => uniq(versions.value.map(v => v.set)));

watch(sets, async values => {
    setProfiles.value = {};

    for (const s of values) {
        setProfile.get(s, v => {
            setProfiles.value = {
                ...setProfiles.value,
                [s]: v,
            };
        });
    }
}, { immediate: true });

const set = computed({
    get() { return data.value?.set ?? route.query.set as string; },
    set(newValue: string) {
        void router.replace({ query: { ...route.query, number: undefined, set: newValue } });
    },
});

const setMaxWidth = computed(() => Math.max(...sets.value.map(s => s.length)));

const number = computed({
    get() { return data.value?.number ?? route.query.number as string; },
    set(newValue: string) {
        void router.replace({ query: { ...route.query, number: newValue } });
    },
});

const setInfos = computed(() => sets.value.map(s => {
    const setVersions = versions.value.filter(v => v.set === s);

    const numbers = [];

    for (const v of setVersions) {
        const currNumber = numbers.find(n => n.number === v.number);

        if (currNumber != null) {
            currNumber.langs.push(v.lang);
        } else {
            numbers.push({ number: v.number, langs: [v.lang] });
        }
    }

    numbers.sort((a, b) => {
        const matchA = /^(\d+)(\w*)$/.exec(a.number);
        const matchB = /^(\d+)(\w*)$/.exec(b.number);

        if (matchA == null) {
            if (matchB == null) {
                return a.number < b.number ? -1 : a.number > b.number ? 1 : 0;
            } else {
                return 1;
            }
        } else if (matchB == null) {
            return -1;
        }

        const numA = Number.parseInt(matchA[1], 10);
        const numB = Number.parseInt(matchB[1], 10);

        return numA < numB
            ? -1
            : numA > numB
                ? 1
                : matchA[2] < matchB[2] ? -1 : matchA[2] > matchB[2] ? 1 : 0;
    });

    const currVersion = (
        s === set.value ? setVersions.find(v => v.number === number.value) : null
    ) ?? setVersions[0];

    const { rarity } = currVersion;

    const profile = setProfiles.value[currVersion.set];

    const name = mapValues(profile?.localization ?? { }, loc => loc.name);

    return {
        set:   s,
        langs: uniq(setVersions.map(v => v.lang)),
        numbers,
        rarity,
        // iconUrl:         `${assetBase}/magic/set/icon/${iconSet}/${rarity}.svg`,
        name:  name?.[game.locale] ?? name?.[game.locales[0]] ?? '',
    };
}));

const langs = computed(() => uniq([
    ...versions.value.map(v => v.lang),
    ...data.value?.localization?.map(v => v.lang) ?? [],
]).sort((a, b) => locales.indexOf(a) - locales.indexOf(b)));

const lang = computed({
    get() { return route.query.lang as string ?? game.locale; },
    set(newValue: string) {
        const allowedVersions = versions.value.filter(v => v.lang === newValue);

        if (allowedVersions.length > 0) {
            const exactVersion = allowedVersions.find(v => v.number === number.value);

            if (exactVersion != null) {
                void router.replace({
                    query: {
                        ...route.query,
                        lang: newValue,
                    },
                });
                return;
            }

            const keepSetVersions = allowedVersions.filter(v => v.set === set.value);

            if (keepSetVersions.length > 0) {
                void router.replace({
                    query: {
                        ...route.query,
                        number: keepSetVersions[0].number,
                        lang:   newValue,
                    },
                });
                return;
            }

            if (allowedVersions.length > 0) {
                void router.replace({
                    query: {
                        ...route.query,
                        set:    allowedVersions[0].set,
                        number: undefined,
                        lang:   newValue,
                    },
                });
                return;
            }
        } else {
            void router.replace({
                query: {
                    ...route.query,
                    lang: newValue,
                },
            });
        }
    },
});

const fallbackLang = (lang: string) => {
    switch (lang) {
    case 'zhs:nw':
    case 'zhs:cn':
    case 'zhs:pro':
    case 'zhs:md':
        return 'ja';
    }
};

const printLang = computed(() => {
    const exactVersions = versions.value.filter(v => v.set === set.value && v.number === number.value);

    if (exactVersions.some(v => v.lang === lang.value)) {
        return lang.value;
    } else if (exactVersions.some(v => v.lang === fallbackLang(lang.value))) {
        return fallbackLang(lang.value);
    } else if (exactVersions.length > 0) {
        return exactVersions[0].lang;
    }

    const keepSetVersions = versions.value.filter(v => v.set === set.value);

    if (keepSetVersions.some(v => v.lang === lang.value)) {
        return lang.value;
    } else if (keepSetVersions.some(v => v.lang === fallbackLang(lang.value))) {
        return fallbackLang(lang.value);
    } else if (keepSetVersions.length > 0) {
        return keepSetVersions[0].lang;
    }

    return versions.value[0].lang;
});

const langWithMode = computed(() => lang.value);

const imageLang = computed(() => {
    if (data.value == null) {
        return lang.value;
    }

    return lang.value;
});

const langInfos = computed(() => langs.value.map(l => ({
    lang:    l,
    exist:   versions.value.filter(v => v.set === set.value).some(v => v.lang === l),
    current: l === lang.value,
})));

const selectedTextInfo = (view: CardPrintView | undefined) => {
    if (view == null) {
        return null;
    }

    switch (textMode.value) {
    case 'unified': {
        const loc = view.localization.find(l => l.lang === lang.value) ?? view.localization[0];

        return {
            name:     loc.name,
            typeline: loc.typeline,
            text:     loc.text,
        };
    }
    case 'printed':
        return {
            name:     view.printName,
            typeline: view.printTypeline,
            text:     view.printText,
        };

    default:
        throw new Error('unreachable');
    }
};

useTitle(() => {
    if (data.value == null) {
        return '';
    }

    return selectedTextInfo(data.value)?.name ?? '';
}, 'input');

useAction([
    {
        action:  'search',
        handler: search,
    },
    {
        action:  'random',
        icon:    'mdi-shuffle-variant',
        handler: random,
    },
]);

const cardId = computed(() => data.value?.cardId ?? '');

const layout = computed(() => data.value?.layout ?? 'normal');

const stats = computed(() => {
    if (data.value == null) {
        return '';
    }

    if (data.value.attack != null && data.value.defense != null) {
        return `${data.value.attack}/${data.value.defense}`;
    }

    return '';
});

const name = computed(() => selectedTextInfo(data.value)?.name);
const typeline = computed(() => selectedTextInfo(data.value)?.typeline);
const text = computed(() => selectedTextInfo(data.value)?.text);

const attribute = computed(() => {
    if (data.value == null) {
        return undefined;
    }

    if (data.value.attribute != null) {
        return data.value.attribute;
    }

    if (data.value.type.main === 'spell') {
        return 'spell';
    }

    if (data.value.type.main === 'trap') {
        return 'trap';
    }

    return undefined;
});

const passcode = computed(() => data.value?.passcode ?? 0);
const relatedCards = computed(() => data.value?.relatedCards ?? []);
const legalities = computed(() => data.value?.legalities ?? {});

const editorLink = computed(() => ({
    name:  'yugioh/data',
    query: {
        tab:    'Editor',
        id:     id.value,
        lang:   lang.value,
        set:    set.value,
        number: number.value,
    },
}));

const apiQuery = computed(() => (route.params.id == null
    ? null
    : omitBy({
        id:     route.params.id as string,
        lang:   route.query.lang as string ?? game.locale,
        set:    route.query.set as string,
        number: route.query.number as string,
    }, v => v == null)));

const jsonLink = computed(() => {
    const url = new URL('yugioh/card', apiBase);

    url.search = new URLSearchParams({ id: id.value }).toString();

    return url.toString();
});

const jsonPrintLink = computed(() => {
    const url = new URL('yugioh/print', apiBase);

    url.search = new URLSearchParams({
        id:     id.value,
        set:    set.value,
        number: number.value,
        lang:   lang.value,
    }).toString();

    return url.toString();
});

// methods
const loadData = async () => {
    if (apiQuery.value == null) {
        return;
    }

    const { data: result } = await apiGet<CardPrintView>('/yugioh/card/print-view', apiQuery.value);

    rotate.value = null;
    data.value = result;
};

const relationIcon = (relation: string) => ({
    intext: 'mdi-card-search-outline',
    source: 'mdi-file-tree-outline',
    token:  'mdi-shape-outline',
})[relation] ?? 'mdi-cards-outline';

// watches
watch(
    [
        () => route.params.id,
        () => route.query.lang,
        () => route.query.set,
        () => route.query.number,
    ],
    loadData,

    { immediate: true },
);

watch(() => game.locale, loadData);

// special effects
watch([id, set, number], () => {
    if (id.value === 'capital_offense') {
        document.body.classList.add('force-lowercase');
    } else {
        document.body.classList.remove('force-lowercase');
    }
}, { immediate: true });

const effectClass = computed(() => {
    if (id.value === 'viscera_seer' && set.value === 'sld' && number.value === 'VS') {
        return ['horizontal-flip'];
    }

    return [];
});

onBeforeRouteLeave((to, from, next) => {
    document.body.classList.remove('force-lowercase');
    next();
});

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
        flex: 0 0 320px

.image-button
    margin-top: 20px
    text-align: center

.artist
    margin-top: 20px
    text-align: center

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

.attribute
    width: 1.2em
    height: 1.2em
    line-height: 1.2em

.ability
    margin-top: 30px

.flavor-text
    margin-top: 20px
    font-style: italic

    &:deep(.emph)
        font-weight: bold

.tag-list, .legalities, .rulings
    margin-top: 20px

.links
    margin-top: 30px

.lang-line
    margin-top: 10px

.related-card-block
    margin-top: 10px

    border: 1px solid $primary
    border-radius: 5px

.set-block
    margin-top: 10px

    border: 1px solid $primary
    border-radius: 5px

.part-icon
    &.flip-1, &.split_arena-1
        transform: rotate(180deg)

    &.split-1
        transform: rotateY(180deg)

    &.aftermath-1
        transform: rotate(90deg)

.sub-name
    font-size: 120%
    color: grey

.color
    width: 1em

.color-indicator
    height: 1em
    margin-right: 5px

.other-stats, .lore
    margin-left: 15px

.link
    width: 150px

.lang-selector
    display: inline
    margin-right: 2px
    margin-top: 2px

.related-card
    padding: 5px
    padding-left: 8px

    &:not(:first-child)
        border-top: 1px solid $primary

.set-line
    position: relative
    padding: 5px
    padding-left: 10px

    &:not(:first-child)
        border-top: 1px solid $primary

    cursor: pointer

.set-dot
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

.set-name
    flex: 1 1 auto

.rarity-icon
    height: 1.2em
    width: 1.2em

.rarity
    text-transform: uppercase
    font-weight: 500
    line-height: 0

.horizontal-flip
    transform: rotateY(180deg)
</style>

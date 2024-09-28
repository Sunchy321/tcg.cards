<template>
    <q-page class="main q-pa-md">
        <div class="image-column">
            <card-image
                v-if="data != null"
                v-model:part="partIndex"
                v-model:rotate="rotate"
                :lang="lang"
                :set="set"
                :number="number"
                :layout="layout"
            />

            <div class="artist">
                {{ artist }}
            </div>
        </div>

        <div class="info-column">
            <div class="name-line row items-center" :class="effectClass">
                <q-btn
                    v-if="partIcon != null"
                    class="part-icon q-mr-sm"
                    :class="partIcon.class || ''"
                    flat round dense
                    :icon="`img:${partIcon.src}`"
                    @click="switchPart"
                />

                <q-icon
                    v-if="isArenaVariant"
                    class="arena-variant q-mr-sm"
                    name="img:/magic/arena.svg"
                />

                <div class="name" :lang="langWithMode">
                    {{ realName }}
                </div>

                <q-space />

                <div v-if="cost != null" class="mana-cost">
                    <magic-symbol
                        v-for="(s, i) in cost" :key="i"
                        :value="`{${s}}`"
                        :type="costStyle"
                    />
                </div>
            </div>
            <div v-if="flavorName != null" class="flavor-name" :lang="lang">
                {{ flavorName }}
            </div>
            <div class="stats-line" :class="effectClass">
                <magic-color
                    v-if="colorIndicator != null"
                    class="color-indicator"
                    :value="colorIndicator"
                />
                <span class="typeline" :lang="langWithMode">{{ typeline }}</span>
                <span v-if="stats != null" class="other-stats">{{ stats }}</span>
            </div>
            <div class="ability auto-align" :class="effectClass" :lang="langWithMode">
                <magic-text :symbol="textSymbolStyle">{{ text }}</magic-text>
            </div>
            <div v-if="attractionLights != null" class="attraction-lights">
                <div
                    v-for="i in 6" :key="i"
                    class="attraction-light"
                    :class="{
                        [`light-${i}`]: true,
                        enabled: attractionLights.includes(i)
                    }"
                >
                    {{ i }}
                </div>
            </div>
            <div v-if="flavorText != null" class="flavor-text auto-align" :class="effectClass" :lang="lang">
                <magic-text :symbol="textSymbolStyle" detect-emph>{{ flavorText }}</magic-text>
            </div>
            <div v-if="tags.length + printTags.length > 0" class="tag-list">
                <q-chip
                    v-for="t in tags"
                    :key="'tag-' + t"
                    class="q-mr-sm q-ma-none"
                    square
                    size="12px"
                    color="primary"
                    text-color="white"
                > {{ $t('magic.tag.' + t) }} </q-chip>
                <q-chip
                    v-for="t in printTags"
                    :key="'tag-' + t"
                    class="q-mr-sm q-ma-none"
                    square
                    size="12px"
                    color="secondary"
                    text-color="white"
                > {{ $t('magic.tag.' + t) }} </q-chip>
            </div>
            <grid
                v-slot="[f, s]"
                :value="Object.entries(legalities)" :item-width="160"
                class="legalities"
            >
                <div class="flex items-center no-wrap">
                    <banlist-icon class="q-mr-sm" :status="s" />
                    <span style="white-space: nowrap;"> {{ $t('magic.format.'+f) }}</span>
                </div>
            </grid>
            <div v-if="rulings.length > 0" class="rulings">
                <div v-for="(r, i) in rulings" :key="i">
                    <magic-text :cards="r.cards" detect-url>
                        {{ r.date }}: {{ r.text }}
                    </magic-text>
                </div>
            </div>

            <div class="links flex q-gutter-md">
                <q-btn
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
                </q-btn>

                <q-btn
                    v-if="jsonLink != null"
                    class="link"
                    :href="jsonLink" target="_blank"
                    outline no-caps
                >
                    <q-icon name="mdi-open-in-new" size="14px" class="q-mr-sm" />
                    JSON
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
                            <img class="set-icon q-mx-sm" :src="i.iconUrl" :alt="set">
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
import { useMagic, TextMode, textModes } from 'store/games/magic';
import { useI18n } from 'vue-i18n';

import basicSetup from 'setup/basic';
import magicSetup from 'setup/magic';
import pageSetup from 'setup/page';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';
import CardImage from 'components/magic/CardImage.vue';
import MagicColor from 'components/magic/Color.vue';
import MagicText from 'components/magic/Text.vue';
import MagicSymbol from 'components/magic/Symbol.vue';
import BanlistIcon from 'components/magic/BanlistIcon.vue';

// TODO fix @interface issue
import { CardPrintView } from 'common/model/magic/card';

import {
    mapValues, omitBy, uniq,
} from 'lodash';

import setProfile, { SetProfile } from 'src/common/magic/set';
import { apiGet, apiBase, imageBase } from 'boot/backend';

import { auxSetType } from 'static/magic/special';

const router = useRouter();
const route = useRoute();
const magic = useMagic();
const i18n = useI18n();
const { isAdmin } = basicSetup();

const { search, random } = magicSetup();

const data = ref<CardPrintView | null>(null);
const rotate = ref<boolean | null>(null);
const setProfiles = ref<Record<string, SetProfile>>({});

const textMode = computed({
    get() { return magic.textMode; },
    set(newValue: TextMode) { magic.textMode = newValue; },
});

const textModeOptions = computed(() => textModes.map(v => ({
    value: v,
    label: i18n.t(`magic.card.text-mode.${v}`),
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

const partIndex = computed({
    get() { return parseInt(route.query.part as string ?? '0', 10); },
    set(newValue: number) {
        void router.replace({ query: { ...route.query, part: newValue } });
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

        return numA < numB ? -1 : numA > numB ? 1
            : matchA[2] < matchB[2] ? -1 : matchA[2] > matchB[2] ? 1 : 0;
    });

    const currVersion = (
        s === set.value ? setVersions.find(v => v.number === number.value) : null
    ) ?? setVersions[0];

    const { rarity } = currVersion;

    const profile = setProfiles.value[currVersion.set];

    const iconSet = (auxSetType.includes(profile?.setType) ? profile?.parent : undefined) ?? s;
    const name = mapValues(profile?.localization ?? { }, loc => loc.name);

    return {
        set:             s,
        langs:           uniq(setVersions.map(v => v.lang)),
        numbers,
        rarity,
        iconUrl:         `https://${imageBase}/magic/set/icon?auto-adjust&set=${iconSet}&rarity=${rarity}`,
        name:            name?.[magic.locale] ?? name?.[magic.locales[0]] ?? '',
        symbolStyle:     profile?.symbolStyle,
        doubleFacedIcon: profile?.doubleFacedIcon,
    };
}));

const langs = computed(() => {
    const locales = magic.extendedLocales;

    return uniq(versions.value.map(v => v.lang))
        .sort((a, b) => locales.indexOf(a) - locales.indexOf(b));
});

const lang = computed({
    get() { return data.value?.lang ?? route.query.lang as string ?? magic.locale; },
    set(newValue: string) {
        const allowedVersions = versions.value.filter(v => v.lang === newValue);

        if (allowedVersions.length === 0) {
            return;
        }

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
        }
    },
});

const langWithMode = computed(() => (textMode.value === 'oracle' ? 'en' : lang.value));

const langInfos = computed(() => langs.value.map(l => ({
    lang:    l,
    exist:   versions.value.filter(v => v.set === set.value).some(v => v.lang === l),
    current: l === lang.value,
})));

const partCount = computed(() => data.value?.parts?.length ?? 1);

const part = computed(() => data.value?.parts?.[partIndex.value]);

const selectedTextInfo = (partValue?: CardPrintView['parts'][0]) => {
    if (partValue == null) {
        return null;
    }

    switch (textMode.value) {
    case 'unified': {
        const loc = partValue.localization.find(l => l.lang === lang.value);

        if (loc != null) {
            return {
                name:     loc.name,
                typeline: loc.typeline,
                text:     loc.text,
            };
        }
    }

    // fallthrough
    case 'oracle':
        return {
            name:     partValue.name,
            typeline: partValue.typeline,
            text:     partValue.text,
        };

    case 'printed':
        return {
            name:     partValue.printName,
            typeline: partValue.printTypeline,
            text:     partValue.printText,
        };

    default:
        throw new Error('unreachable');
    }
};

pageSetup({
    title: () => {
        if (data.value == null) {
            return '';
        }

        if (lang.value === 'ph') {
            return data.value.parts.map(p => p.name).join(' // ');
        } else {
            return data.value.parts.map(p => selectedTextInfo(p)!.name).join(' // ');
        }
    },

    titleType: 'input',

    actions: [
        {
            action:  'search',
            handler: search,
        },
        {
            action:  'random',
            icon:    'mdi-shuffle-variant',
            handler: random,
        },
    ],
});

const layout = computed(() => data.value?.layout);
const cost = computed(() => part.value?.cost);

const stats = computed(() => {
    const p = part.value;

    if (p == null) { return undefined; }

    if (p.power != null && p.toughness != null) {
        return `${p.power}/${p.toughness}`;
    }

    if (p.loyalty != null) {
        return `[${p.loyalty}]`;
    }

    if (p.defense != null) {
        return `<${p.defense}>`;
    }

    if (p.handModifier != null && p.lifeModifier != null) {
        return `${p.handModifier};${p.lifeModifier}`;
    }

    return undefined;
});

const colorIndicator = computed(() => part.value?.colorIndicator);

const name = computed(() => selectedTextInfo(part.value)?.name);
const typeline = computed(() => selectedTextInfo(part.value)?.typeline);
const text = computed(() => selectedTextInfo(part.value)?.text);

const isArenaVariant = computed(() => name.value?.startsWith('A-'));

const realName = computed(() => {
    const nameValue = name.value;

    if (nameValue == null) {
        return undefined;
    }

    if (nameValue.startsWith('A-')) {
        return nameValue.slice(2);
    }

    return nameValue;
});

const attractionLights = computed(() => part.value?.attractionLights);

const flavorText = computed(() => part.value?.flavorText);
const flavorName = computed(() => part.value?.flavorName);
const artist = computed(() => part.value?.artist);

const relatedCards = computed(() => data.value?.relatedCards ?? []);
const rulings = computed(() => data.value?.rulings ?? []);
const legalities = computed(() => data.value?.legalities ?? {});

const tags = computed(() => data.value?.tags?.filter(v => !v.startsWith('dev:')) ?? []);
const printTags = computed(() => data.value?.printTags?.filter(v => !v.startsWith('dev:')) ?? []);

const doubleFacedIcon = computed(() => setInfos.value
    .filter(v => v.doubleFacedIcon != null)[0]
    ?.doubleFacedIcon);

const partIcon = computed(() => {
    switch (layout.value) {
    case 'flip':
    case 'split':
    case 'aftermath':
    case 'split_arena':
        return {
            src:   `/magic/part-icon/${layout.value}.svg`,
            class: `${layout.value}-${partIndex.value}`,
        };
    case 'transform':
    case 'transform_token':
        if (doubleFacedIcon.value != null) {
            return {
                src: `/magic/part-icon/${layout.value}-${doubleFacedIcon.value[partIndex.value]}.svg`,
            };
        } else {
            return {
                src: `/magic/part-icon/transform-${partIndex.value}.svg`,
            };
        }
    case 'modal_dfc':
    case 'adventure':
        return {
            src: `/magic/part-icon/${layout.value}-${partIndex.value}.svg`,
        };
    case 'multipart':
        return {
            src: '/magic/part-icon/multipart.svg',
        };
    default:
        return null;
    }
});

const symbolStyle = computed(() => {
    if (textMode.value !== 'printed') {
        return [];
    } else {
        return setInfos.value.find(i => i.set === set.value)?.symbolStyle ?? [];
    }
});

const costStyle = computed(() => {
    if (id.value === 'b_f_m___big_furry_monster_') {
        return [...symbolStyle.value, 'cost', 'mini'];
    } else {
        return [...symbolStyle.value, 'cost'];
    }
});

const textSymbolStyle = computed(() => symbolStyle.value);

const editorLink = computed(() => ({
    name:  'magic/data',
    query: {
        tab:    'Editor',
        id:     id.value,
        lang:   lang.value,
        set:    set.value,
        number: number.value,
        part:   partIndex.value,
    },
}));

const scryfallLink = computed(() => {
    const cardId = data.value?.scryfall?.cardId;

    if (cardId == null) {
        return null;
    }

    return `https://scryfall.com/card/${cardId}`;
});

const gathererLink = computed(() => {
    const multiverseId = (() => {
        const multiverseIds = data.value?.multiverseId;

        if (multiverseIds == null) {
            return null;
        }

        if (layout.value != null && ['split', 'adventure'].includes(layout.value)) {
            return multiverseIds[0];
        }

        return multiverseIds[partIndex.value];
    })();

    if (multiverseId == null) {
        return null;
    }

    return `https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${multiverseId}&printed=true`;
});

const apiQuery = computed(() => (route.params.id == null ? null : omitBy({
    id:     route.params.id as string,
    lang:   route.query.lang as string ?? magic.locale,
    set:    route.query.set as string,
    number: route.query.number as string,
}, v => v == null)));

const jsonLink = computed(() => {
    const url = new URL('magic/card', `https://${apiBase}`);

    const query = apiQuery.value;

    if (query != null) {
        url.search = new URLSearchParams(query).toString();
    }

    return url.toString();
});

// methods
const loadData = async () => {
    if (apiQuery.value == null) {
        return;
    }

    const { data: result } = await apiGet<CardPrintView>('/magic/card/print-view', apiQuery.value);

    rotate.value = null;
    data.value = result;
};

const switchPart = () => {
    if (partIndex.value === partCount.value - 1) {
        partIndex.value = 0;
    } else {
        partIndex.value += 1;
    }
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
    [
        () => route.params.id,
        () => route.query.lang,
        () => route.query.set,
        () => route.query.number,
    ],
    loadData,

    { immediate: true },
);

watch(() => magic.locale, loadData);

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

.ability
    margin-top: 30px

.attraction-lights
    margin-top: 20px

    & > *:not(:last-child)
        margin-right: 5px

.attraction-light
    display: inline-flex
    justify-content: center
    align-items: center

    height: 20px
    width: 20px

    background-color: #494947
    border: 1.5px white solid
    border-radius: 50%
    box-shadow: -2px 1px 2px rgb(0 0 0 / 33%)

    &.enabled
        color: #FFF

    &.light-2.enabled
        background-color: #0A86A6

    &.light-3.enabled
        background-color: #7AC057

    &.light-4.enabled
        background-color: #B9B36A

    &.light-5.enabled
        background-color: #A83F81

    &.light-6.enabled
        background-color: #C77151

.flavor-text
    margin-top: 20px
    font-style: italic

    &:deep(.emph)
        font-style: normal

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

.flavor-name
    font-size: 120%
    color: grey

.mana-cost
    display: inline-flex
    align-items: center
    margin-left: 5px

.color-indicator
    height: 1em
    margin-right: 5px

.other-stats
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

.set-icon
    height: 1em

.rarity
    text-transform: uppercase
    font-weight: 500
    line-height: 0

.horizontal-flip
    transform: rotateY(180deg)
</style>

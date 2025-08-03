<template>
    <q-page class="main q-pa-md">
        <div class="image-column">
            <card-image
                v-if="data != null"
                v-model:part="partIndex"
                v-model:rotate="rotate"
                :lang="imageLang"
                :set="set"
                :number="number"
                :layout="layout"
                :full-image-type="fullImageType"
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
            <div v-if="realSubname != null" class="subname" :lang="lang">
                {{ realSubname }}
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
                <rich-text :lang="langWithMode" :symbol="textSymbolStyle">{{ text }}</rich-text>
            </div>
            <div v-if="attractionLights != null" class="attraction-lights">
                <div
                    v-for="i in 6" :key="i"
                    class="attraction-light"
                    :class="{
                        [`light-${i}`]: true,
                        enabled: attractionLights[i] === '1'
                    }"
                >
                    {{ i }}
                </div>
            </div>
            <div v-if="flavorText != null" class="flavor-text auto-align" :class="effectClass" :lang="lang">
                <rich-text :symbol="textSymbolStyle" detect-emph>{{ flavorText }}</rich-text>
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
                >
                    {{ $t('magic.tag.' + t) }}
                </q-chip>
                <q-chip
                    v-for="t in printTags"
                    :key="'tag-' + t"
                    class="q-mr-sm q-ma-none"
                    square
                    size="12px"
                    color="secondary"
                    text-color="white"
                >
                    {{ $t('magic.tag.' + t) }}
                </q-chip>
            </div>
            <grid
                v-slot="v"
                :value="legalityEntries" :item-width="160"
                class="legalities"
            >
                <div class="flex items-center no-wrap">
                    <banlist-icon class="q-mr-sm" :status="v[1]" />
                    <span style="white-space: nowrap;"> {{ $t('magic.format.' + v[0]) }}</span>
                </div>
            </grid>
            <div v-if="rulings.length > 0" class="rulings">
                <div v-for="r in rulings" :key="r.date + r.richText">
                    <rich-text detect-url>
                        {{ r.date }}: {{ r.richText }}
                    </rich-text>
                </div>
            </div>

            <div class="links flex q-gutter-md">
                <q-btn-dropdown class="link" color="primary" :label="$t('magic.ui.card.external-link')">
                    <q-list>
                        <q-item
                            v-for="{ name: linkName, link } in links" :key="linkName"
                            v-close-popup :href="link" target="_blank"
                        >
                            <q-item-section avatar>
                                <q-avatar color="primary" text-color="white" :icon="`img:/magic/${linkName}.svg`" />
                            </q-item-section>
                            <q-item-section>
                                <q-item-label>{{ $t(`magic.ui.card.link-name.${linkName}`) }}</q-item-label>
                            </q-item-section>
                        </q-item>
                    </q-list>
                </q-btn-dropdown>

                <q-btn-group class="link">
                    <q-btn
                        class="q-btn--no-hover"
                        style="width: 30px"
                        icon="mdi-code-json"
                        color="primary"
                        :ripple="false"
                    />
                    <q-btn
                        v-if="jsonCardLink != null"
                        class="col-grow"
                        color="primary"
                        :href="jsonCardLink" target="_blank"
                        no-caps
                    >
                        {{ $t('magic.ui.card.link-name.card') }}
                    </q-btn>

                    <q-btn
                        v-if="jsonPrintLink != null"
                        class="col-grow"
                        color="primary"
                        :href="jsonPrintLink" target="_blank"
                        no-caps
                    >
                        {{ $t('magic.ui.card.link-name.print') }}
                    </q-btn>
                </q-btn-group>
            </div>
        </div>

        <div class="version-column">
            <div class="text-mode row no-wrap">
                <q-btn
                    v-if="editorEnabled"
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
import { useI18n } from 'vue-i18n';
import { useCore, useTitle } from 'store/core';
import { useGame, TextMode, textModes } from 'store/games/magic';

import magicSetup from 'setup/magic';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';
import CardImage from 'components/magic/CardImage.vue';
import MagicColor from 'components/magic/Color.vue';
import RichText from 'src/components/magic/RichText.vue';
import MagicSymbol from 'components/magic/Symbol.vue';
import BanlistIcon from 'components/magic/BanlistIcon.vue';

import { CardFullView } from '@model/magic/print';
import { SetProfile } from '@model/magic/set';

import { omitBy, uniq } from 'lodash';

import { apiBase, assetBase } from 'boot/server';
import { getValue, trpc } from 'src/hono';
import { auth, checkAdmin } from '@/auth';

import { auxSetType } from '@static/magic/special';
import { formats, FullLocale, fullLocale } from '@model/magic/basic';

const router = useRouter();
const route = useRoute();
const i18n = useI18n();
const core = useCore();
const game = useGame();
const session = auth.useSession();

const { search, random } = magicSetup();

const data = ref<CardFullView | null>(null);
const rotate = ref<boolean | null>(null);
const setProfiles = ref<Record<string, SetProfile>>({});

const editorEnabled = computed(() => {
    return checkAdmin(session.value, 'admin/magic');
});

const textMode = computed({
    get() { return game.textMode; },
    set(newValue: TextMode) { game.textMode = newValue; },
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
    for (const s of values) {
        const result = await getValue(trpc.magic.set.profile, { setId: s });

        if (result != null) {
            setProfiles.value[s] = result;
        }
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

    const iconSet = (auxSetType.includes(profile?.type) ? profile?.parent : undefined) ?? s;

    const localizations = profile?.localization;

    const name = localizations?.find(loc => loc.lang === game.locale)?.name
      ?? localizations?.find(loc => loc.lang === game.locales[0])?.name
      ?? localizations?.[0]?.name
      ?? '';

    return {
        set:             s,
        langs:           uniq(setVersions.map(v => v.lang)),
        numbers,
        rarity,
        iconUrl:         `${assetBase}/magic/set/icon/${iconSet}/${rarity}.svg`,
        name,
        symbolStyle:     profile?.symbolStyle,
        doubleFacedIcon: profile?.doubleFacedIcon,
    };
}));

const langs = computed(() => {
    return uniq(versions.value.map(v => v.lang))
        .sort((a, b) => fullLocale.options.indexOf(a) - fullLocale.options.indexOf(b));
});

const lang = computed({
    get() { return (data.value?.lang ?? route.query.lang ?? game.locale) as FullLocale; },
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

const imageLang = computed(() => {
    if (data.value == null) {
        return lang.value;
    }

    if (data.value.print.imageStatus !== 'placeholder') {
        return lang.value;
    }

    const setInfo = setInfos.value.find(i => i.set === set.value);

    return setInfo?.langs?.[0] ?? 'en';
});

const langInfos = computed(() => langs.value.map(l => ({
    lang:    l,
    exist:   versions.value.filter(v => v.set === set.value).some(v => v.lang === l),
    current: l === lang.value,
})));

const partCount = computed(() => data.value?.card.partCount ?? 1);

const part = computed(() => data.value?.cardPart);

const selectedTextInfo = computed(() => {
    if (data.value == null) {
        return undefined;
    }

    switch (textMode.value) {
    case 'unified':
        return data.value.cardPartLocalization;
    case 'oracle':
        return data.value.cardPart;
    case 'printed':
        return data.value.print;
    default:
        throw new Error('unreachable');
    }
});

useTitle(() => {
    if (data.value == null) {
        return '';
    }

    if (['ph', 'qya'].includes(lang.value)) {
        return data.value.card.name;
    } else {
        return selectedTextInfo.value!.name;
    }
});

core.titleType = 'input',

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

const layout = computed(() => data.value?.print.layout ?? 'normal');
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

const name = computed(() => selectedTextInfo.value?.name);
const typeline = computed(() => selectedTextInfo.value?.typeline);
const text = computed(() => selectedTextInfo.value?.text);

const isArenaVariant = computed(() => name.value?.startsWith('A-'));

const realName = computed(() => {
    let nameValue = name.value;

    if (flavorName.value != null) {
        return flavorName.value;
    }

    if (nameValue == null) {
        return undefined;
    }

    if (nameValue.startsWith('A-')) {
        return nameValue.slice(2);
    }

    return nameValue;
});

const realSubname = computed(() => {
    if (flavorName.value != null) {
        return name.value;
    } else {
        return undefined;
    }
});

const attractionLights = computed(() => data.value?.printPart.attractionLights);

const flavorText = computed(() => data.value?.printPart.flavorText);
const flavorName = computed(() => data.value?.printPart.flavorName);
const artist = computed(() => data.value?.printPart.artist);

const relatedCards = computed(() => data.value?.relatedCards ?? []);
const rulings = computed(() => data.value?.rulings ?? []);
const legalities = computed(() => data.value?.card.legalities ?? {});

const legalityEntries = computed(() => Object.entries(legalities.value).sort(
    (a, b) => formats.indexOf(a[0]) - formats.indexOf(b[0]),
));

const tags = computed(() => data.value?.card.tags?.filter(v => !v.startsWith('dev:')) ?? []);
const printTags = computed(() => data.value?.print.printTags?.filter(v => !v.startsWith('dev:')) ?? []);

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

const fullImageType = computed(() => data.value?.print.fullImageType ?? 'jpg');

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
    const cardId = data.value?.print.scryfallCardId;

    if (cardId == null) {
        return null;
    }

    return `https://scryfall.com/card/${cardId}`;
});

const gathererLink = computed(() => {
    const multiverseId = (() => {
        const multiverseIds = data.value?.print.multiverseId;

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

const mtgchLink = computed(() => {
    return `https://mtgch.com/card/${set.value}/${number.value}`;
});

const links = computed(() => {
    const result = [];

    if (scryfallLink.value != null) {
        result.push({
            name: 'scryfall',
            link: scryfallLink.value,
        });
    }

    if (gathererLink.value != null) {
        result.push({
            name: 'gatherer',
            link: gathererLink.value,
        });
    }

    if (mtgchLink.value != null) {
        result.push({
            name: 'mtgch',
            link: mtgchLink.value,
        });
    }

    return result;
});

const apiQuery = computed(() => {
    if (route.params.id == null) {
        return undefined;
    }

    const query = {
        cardId: route.params.id as string,
        lang:   route.query.lang as FullLocale ?? game.locale,
        set:    route.query.set as string,
        number: route.query.number as string,
    };

    return omitBy(query, v => v == null) as {
        cardId:  string;
        lang:    FullLocale;
        set?:    string;
        number?: string;
    };
});

const jsonCardLink = computed(() => {
    const url = new URL('magic/card', apiBase);

    url.search = new URLSearchParams({
        id:        id.value,
        lang:      lang.value,
        partIndex: partIndex.value.toString(),
    }).toString();

    return url.toString();
});

const jsonPrintLink = computed(() => {
    const url = new URL('magic/print', apiBase);

    url.search = new URLSearchParams({
        id:        id.value,
        set:       set.value,
        number:    number.value,
        lang:      lang.value,
        partIndex: partIndex.value.toString(),
    }).toString();

    return url.toString();
});

// methods
const loadData = async () => {
    if (apiQuery.value == null) {
        return;
    }

    const result = await getValue(trpc.magic.card.fuzzy, apiQuery.value);

    if (result != null) {
        rotate.value = null;
        data.value = result;
    }
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

.subname
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
    min-width: 180px

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

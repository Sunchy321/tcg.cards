<template>
    <q-page class="row q-pa-md">
        <div class="col">
            <div class="row">
                <div class="col-4">
                    <card-image
                        v-if="data != null"
                        v-model:part="partIndex"
                        v-model:rotate="rotate"
                        :lang="lang"
                        :set="set"
                        :number="number"
                        :layout="layout"
                    />

                    <div class="artist-line">
                        {{ artist }}
                    </div>
                </div>

                <div class="col q-px-md">
                    <div class="name-line row items-center">
                        <q-btn
                            v-if="partIcon != null"
                            class="part-icon q-mr-sm"
                            :class="partIcon.class || ''"
                            flat round dense
                            :icon="`img:${partIcon.src}`"
                            @click="switchPart"
                        />

                        <div class="name" :lang="lang">
                            {{ name }}
                        </div>

                        <div class="col-grow" />

                        <div
                            v-if="cost != null"
                            class="mana-cost"
                        >
                            <magic-symbol
                                v-for="(s, i) in cost" :key="i"
                                :value="s"
                                :type="costStyles"
                            />
                        </div>
                    </div>
                    <div class="stats-line">
                        <magic-color
                            v-if="colorIndicator != null"
                            class="color-indicator"
                            :value="colorIndicator"
                        />
                        <span class="typeline" :lang="lang">{{ typeline }}</span>
                        <span v-if="stats != null" class="other-stats">{{ stats }}</span>
                    </div>
                    <div class="ability-line" :lang="lang">
                        <magic-text :symbol="symbolStyle">{{ text }}</magic-text>
                    </div>
                    <div v-if="flavor != null" class="flavor-line" :lang="lang">
                        <magic-text :symbol="symbolStyle">{{ flavor }}</magic-text>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-3">
            <div class="text-mode row">
                <q-btn
                    v-if="isAdmin"
                    icon="mdi-file-edit"
                    class="q-mr-sm"
                    dense flat round
                    @click="toEditor"
                />

                <q-btn-toggle
                    v-model="textMode"
                    class="col-grow"
                    :options="textModeOptions"
                    toggle-color="primary"
                    outline spread
                />
            </div>

            <div class="lang-line">
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

            <div v-if="relatedCards.length > 0" class="related-card-block">
                <div v-for="r in relatedCards" :key="r.cardId" class="related-card">
                    <card-avatar :id="r.cardId" />
                </div>
            </div>

            <div class="set-block">
                <div v-for="i in setInfos" :key="i.set" class="set-line">
                    <div v-if="i.langs.includes(lang)" class="set-dot" :class="{ current: i.set === set }" />
                    <div>
                        <div v-ripple class="flex no-wrap items-center" @click="set = i.set">
                            <span class="code q-mr-sm">{{ i.set }}</span>
                            <span class="set-name">{{ i.name }}</span>
                            <img class="set-icon q-ml-sm" :src="i.iconUrl">
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

<style lang="sass" scoped>
.image-button
    margin-top: 20px
    text-align: center

.artist-line
    margin-top: 20px
    text-align: center

.name-line
    font-size: 200%
    display: flex
    align-items: center

.stats-line
    margin-top: 10px
    display: flex
    align-items: center

.ability-line
    margin-top: 30px

.flavor-line
    margin-top: 20px
    font-style: italic

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

.name
    display: inline

.mana-cost
    display: inline-flex
    align-items: center
    margin-left: 5px

.color-indicator
    height: 1em
    margin-right: 5px

.other-stats
    margin-left: 15px

.lang-selector
    display: inline
    margin-right: 2px
    margin-top: 2px

.related-card
    padding: 5px

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
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';

import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import basicSetup from 'setup/basic';
import magicSetup from 'setup/magic';
import pageSetup from 'setup/page';

import CardAvatar from 'components/magic/CardAvatar.vue';
import CardImage from 'components/magic/CardImage.vue';
import MagicColor from 'components/magic/Color.vue';
import MagicText from 'components/magic/Text.vue';
import MagicSymbol from 'components/magic/Symbol.vue';

import { TextMode, textModes } from 'src/store/games/magic';

import { omit, omitBy, uniq } from 'lodash';

import { apiGet, imageBase } from 'boot/backend';

interface Card {
    cardId: string;

    setId: string;
    number: string;
    lang: string;

    layout: string;

    parts: {
        cost: string[];

        color: string;
        colorIndicator?: string;

        power?: string;
        toughness?: string;
        loyalty?: string;
        handModifier?: string;
        lifeModifier?: string;

        oracle: {
            name: string;
            typeline: string;
            text: string;
        };

        unified: {
            name: string;
            typeline: string;
            text: string;
        };

        printed: {
            name: string;
            typeline: string;
            text: string;
        };

        flavorText: string;
        artist: string;
    }[];

    versions: {
        lang: string;
        set: string;
        number: string;

        rarity: string;

        // set info
        name: Record<string, string>;
        symbolStyle: string[];
        parent?: string;
    }[];

    relatedCards: {
        relation: string;
        cardId: string;
        version?: {
            lang: string;
            set: string;
            number: string;
        }
    }[];
}

export default defineComponent({
    components: { CardAvatar, CardImage, MagicColor, MagicText, MagicSymbol },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const store = useStore();
        const i18n = useI18n();
        const basic = basicSetup();

        const { search, random } = magicSetup();

        const data = ref<Card|null>(null);
        const rotate = ref<boolean|null>(null);

        pageSetup({
            title: () => {
                if (data.value == null) {
                    return '';
                }

                return data.value.parts.map(p => p[textMode.value].name).join(' // ');
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

        const textMode = computed({
            get() { return store.getters['magic/textMode']; },
            set(newValue: TextMode) {
                store.commit('magic/textMode', newValue);
            },
        });

        const textModeOptions = computed(() => textModes.map(v => ({
            value: v,
            label: i18n.t('magic.card.text-mode.' + v),
        })));

        // Data fields
        const id = computed(() => data.value?.cardId ?? route.params.id as string);
        const versions = computed(() => data.value?.versions ?? []);

        const sets = computed(() => uniq(versions.value.map(v => v.set)));

        const set = computed({
            get() { return data.value?.setId ?? route.query.set as string; },
            set(newValue: string) { void router.replace({ query: { ...omit(route.query, 'number'), set: newValue } }); },
        });

        const setInfos = computed(() => {
            return sets.value.map(s => {
                const setVersions = versions.value.filter(v => v.set === s);

                const numbers = [];

                for (const v of setVersions) {
                    const n = numbers.find(n => n.number === v.number);

                    if (n != null) {
                        n.langs.push(v.lang);
                    } else {
                        numbers.push({ number: v.number, langs: [v.lang] });
                    }
                }

                numbers.sort((a, b) => {
                    const ma = /^(.*?)(?:-\d|[ab])?$/.exec(a.number)![1];
                    const mb = /^(.*?)(?:-\d|[ab])?$/.exec(b.number)![1];

                    const len = Math.max(ma.length, mb.length);

                    const pa = ma.padStart(len, '0');
                    const pb = mb.padStart(len, '0');

                    return pa < pb ? -1 : pa > pb ? 1 : 0;
                });

                const currVersion = (
                    s === set.value ? setVersions.find(v => v.number === number.value) : null
                ) ?? setVersions[0];

                const rarity = currVersion.rarity;
                const iconSet = currVersion.parent ?? s;

                return {
                    set:     s,
                    langs:   uniq(setVersions.map(v => v.lang)),
                    numbers,
                    rarity,
                    iconUrl: `http://${imageBase}/magic/set/icon?auto-adjust&set=${iconSet}&rarity=${rarity}`,
                    name:    currVersion.name[store.getters.locale] ??
                        currVersion.name[store.getters.locales[0]] ?? s,
                    symbolStyle: currVersion.symbolStyle,
                };
            });
        });

        const langs = computed(() => {
            const locales = store.getters['magic/locales'];
            return uniq(versions.value.map(v => v.lang)).sort((a, b) => {
                const idxa = locales.indexOf(a);
                const idxb = locales.indexOf(b);

                if (idxa === -1) {
                    if (idxb === -1) {
                        return a < b ? -1 : a > b ? 1 : 0;
                    } else {
                        return 1;
                    }
                } else {
                    if (idxb === -1) {
                        return -1;
                    } else {
                        return idxa - idxb;
                    }
                }
            });
        });

        const lang = computed({
            get() { return data.value?.lang ?? route.query.lang as string ?? store.getters['magic/locale']; },
            set(newValue: string) {
                const info = setInfos.value.find(i => i.set === set.value);

                if (info == null) {
                    return;
                }

                if (info.langs.includes(newValue)) {
                    void router.replace({ query: { ...route.query, lang: newValue } });
                } else {
                    const info = setInfos.value.find(i => i.langs.includes(newValue));

                    if (info != null) {
                        void router.replace({
                            query: {
                                ...route.query,
                                set:    info.set,
                                number: undefined,
                                lang:   newValue,
                            },
                        });
                    }
                }
            },
        });

        const langInfos = computed(() => {
            return langs.value.map(l => ({
                lang:    l,
                exist:   versions.value.filter(v => v.set === set.value).some(v => v.lang === l),
                current: l === lang.value,
            }));
        });

        const number = computed({
            get() { return data.value?.number ?? route.query.number as string; },
            set(newValue: string) { void router.replace({ query: { ...route.query, number: newValue } }); },
        });

        const partCount = computed(() => data.value?.parts?.length ?? 1);

        const partIndex = computed({
            get() { return parseInt(route.query.part as string ?? '0'); },
            set(newValue: number) { void router.replace({ query: { ...route.query, part: newValue } }); },
        });

        const part = computed(() => data.value?.parts?.[partIndex.value]);

        const layout = computed(() => data.value?.layout);
        const cost = computed(() => part.value?.cost);

        const stats = computed(() => {
            const p = part.value;

            if (p == null) { return undefined; }
            if (p.power && p.toughness) { return `${p.power}/${p.toughness}`; }
            if (p.loyalty) { return `[${p.loyalty}]`; }
            if (p.handModifier && p.lifeModifier) { return `${p.handModifier};${p.lifeModifier}`; }

            return undefined;
        });

        const colorIndicator = computed(() => part.value?.colorIndicator);

        const name = computed(() => part.value?.[textMode.value]?.name);
        const typeline = computed(() => part.value?.[textMode.value]?.typeline);
        const text = computed(() => part.value?.[textMode.value]?.text);

        const flavor = computed(() => part.value?.flavorText);
        const artist = computed(() => part.value?.artist);

        const relatedCards = computed(() => data.value?.relatedCards ?? []);

        const partIcon = computed(() => {
            switch (layout.value) {
            case 'flip':
            case 'split':
            case 'aftermath':
            case 'split_arena':
                return {
                    src:   `magic/part-icon/${layout.value}.svg`,
                    class: `${layout.value}-${partIndex.value}`,
                };
            case 'transform':
            case 'modal_dfc':
            case 'adventure':
                return {
                    src: `magic/part-icon/${layout.value}-${partIndex.value}.svg`,
                };
            case 'multipart':
                return {
                    src: 'magic/part-icon/multipart.svg',
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

        const costStyles = computed(() => {
            if (id.value === 'b_f_m___big_furry_monster_') {
                return [...symbolStyle.value, 'cost', 'mini'];
            } else {
                return [...symbolStyle.value, 'cost'];
            }
        });

        // methods
        const loadData = async() => {
            const query = omitBy({
                id:     route.params.id,
                lang:   route.query.lang ?? store.getters['magic/locale'],
                set:    route.query.set,
                number: route.query.number,
            }, v => v == null);

            const { data: result } = await apiGet<Card>('/magic/card', query);

            rotate.value = null;
            data.value = result;
        };

        const toEditor = () => {
            if (basic.isAdmin) {
                void router.push({
                    path:  '/magic/data',
                    query: {
                        tab:    'card',
                        id:     id.value,
                        lang:   lang.value,
                        set:    set.value,
                        number: number.value,
                        part:   partIndex.value,
                    },
                });
            }
        };

        const switchPart = () => {
            if (partIndex.value === partCount.value - 1) {
                partIndex.value = 0;
            } else {
                partIndex.value = partIndex.value + 1;
            }
        };

        // watches
        watch(
            [() => route.params.id, () => route.query.lang, () => route.query.set, () => route.query.number],
            loadData, { immediate: true },
        );

        watch(() => store.getters['magic/locale'], loadData);

        watch(id, () => {
            if (id.value === 'capital_offense') {
                document.body.classList.add('force-lowercase');
            } else {
                document.body.classList.remove('force-lowercase');
            }
        }, { immediate: true });

        onBeforeRouteLeave((to, from, next) => {
            document.body.classList.remove('force-lowercase');
            next();
        });

        return {
            isAdmin: basic.isAdmin,

            data,
            rotate,

            lang,
            set,
            number,
            layout,
            partIndex,
            name,
            cost,
            stats,
            colorIndicator,
            typeline,
            text,
            flavor,
            artist,
            relatedCards,

            partIcon,
            symbolStyle,
            costStyles,

            setInfos,
            langInfos,

            textModeOptions,
            textMode,

            switchPart,
            toEditor,
        };
    },
});
</script>

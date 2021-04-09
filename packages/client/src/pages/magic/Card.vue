<template>
    <q-page class="row q-pa-md">
        <div class="col">
            <div class="row">
                <div class="col-4">
                    <card-image
                        v-if="data != null"
                        :lang="lang"
                        :set="set"
                        :number="number"
                        :layout="layout"
                        :part="partIndex"
                        :rotate="rotate"
                        @part="v => partIndex = v"
                        @rotate="v => rotate = v"
                    />

                    <div class="artist-line">
                        {{ artist }}
                    </div>
                </div>

                <div class="col q-px-md">
                    <div class="name-line row items-center">
                        <q-btn
                            v-if="partIcon != null"
                            class="q-mr-sm"
                            flat round dense
                            :icon="partIcon"
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
                    <div class="info-line">
                        <magic-color
                            v-if="colorIndicator != null"
                            class="color-indicator"
                            :value="colorIndicator"
                        />
                        <span class="typeline" :lang="lang">{{ typeline }}</span>
                        <span v-if="info != null" class="other-info">{{ info }}</span>
                    </div>
                    <div class="ability-line" :lang="lang">
                        <magic-text :type="symbolStyle">{{ text }}</magic-text>
                    </div>
                    <div v-if="flavor != null" class="flavor-line" :lang="lang">
                        <magic-text :type="symbolStyle">{{ flavor }}</magic-text>
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
                <div v-for="r in relatedCardInfos" :key="r.cardId" class="related-card">
                    <router-link :to="r.route">
                        {{ r.name }}
                    </router-link>
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

<style lang="stylus" scoped>
.image-button
    margin-top 20px
    text-align center

.artist-line
    margin-top 20px
    text-align center

.name-line
    font-size 200%
    display flex
    align-items centerima

.info-line
    margin-top 10px
    display flex
    align-items center

.ability-line
    margin-top 30px

.flavor-line
    margin-top 20px
    font-style italic

.lang-line
    margin-top 10px

.related-card-block
    margin-top 10px

    border 1px solid $primary
    border-radius 5px

.set-block
    margin-top 10px

    border 1px solid $primary
    border-radius 5px

.name
    display inline

.mana-cost
    display inline-flex
    align-items center
    margin-left 5px

.color-indicator
    height 1em
    margin-right 5px

.other-info
    margin-left 15px

.lang-selector
    display inline
    margin-right 2px
    margin-top 2px

.related-card
    padding 5px

    &:not(:first-child)
        border-top 1px solid $primary

.set-line
    position relative
    padding 5px
    padding-left 10px

    &:not(:first-child)
        border-top 1px solid $primary

    cursor pointer

.set-dot
    width 10px
    height 10px
    border-radius 100px
    border 1px $primary solid

    background-color white

    &.current
        background-color $primary

    position absolute
    left -5px
    top 50%
    transform translateY(-50%)

.set-name
    flex 1 1 auto

.set-icon
    height 1em
</style>

<script>
import page from 'src/mixins/page';
import magic from 'src/mixins/magic';

import CardImage from 'components/magic/CardImage';
import MagicColor from 'components/magic/Color';
import MagicText from 'components/magic/Text';
import MagicSymbol from 'components/magic/Symbol';

import { omit, omitBy, uniq } from 'lodash';
import mapComputed from 'src/map-computed';

import { imageBase } from 'boot/backend';

export default {
    name: 'Card',

    components: { CardImage, MagicColor, MagicText, MagicSymbol },

    mixins: [page, magic],

    data: () => ({
        data:        null,
        rotate:      null,
        unsubscribe: null,
    }),

    computed: {
        pageOptions() {
            return {
                title:   'input',
                actions: [
                    { icon: 'mdi-shuffle-variant', action: 'random' },
                ],
            };
        },

        title() {
            if (this.data == null) {
                return '';
            }

            return this.data.parts.map(p => p[this.textMode].name).join(' // ');
        },

        ...mapComputed({
            textMode: 'magic/cardTextMode',
        }),

        textModeOptions() {
            return ['oracle', 'unified', 'printed'].map(v => ({
                value: v,
                label: this.$t('magic.card.text-mode.' + v),
            }));
        },

        id() { return this.data?.cardId ?? this.$route.params.id; },

        versions() { return this.data?.versions ?? []; },

        langs() {
            const locales = this.$store.getters['magic/locales'];
            return uniq(this.versions.map(v => v.lang)).sort((a, b) => {
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
        },

        langInfos() {
            return this.langs.map(l => ({
                lang:    l,
                exist:   this.versions.filter(v => v.set === this.set).some(v => v.lang === l),
                current: l === this.lang,
            }));
        },

        sets() { return uniq(this.versions.map(v => v.set)); },

        setInfos() {
            return this.sets.map(s => {
                const versions = this.versions.filter(v => v.set === s);

                const numbers = [];

                for (const v of versions) {
                    const n = numbers.find(n => n.number === v.number);

                    if (n != null) {
                        n.langs.push(v.lang);
                    } else {
                        numbers.push({ number: v.number, langs: [v.lang] });
                    }
                }

                numbers.sort((a, b) => {
                    const ma = /^(.*?)(?:-\d|[ab])?$/.exec(a.number)[1];
                    const mb = /^(.*?)(?:-\d|[ab])?$/.exec(b.number)[1];

                    const len = Math.max(ma.length, mb.length);

                    const pa = ma.padStart(len, '0');
                    const pb = mb.padStart(len, '0');

                    return pa < pb ? -1 : pa > pb ? 1 : 0;
                });

                const currVersion = (
                    s === this.set ? versions.find(v => v.number === this.number) : null
                ) ?? versions[0];

                const rarity = currVersion.rarity;
                const iconSet = currVersion.parent ?? s;

                return {
                    set:     s,
                    langs:   uniq(versions.map(v => v.lang)),
                    numbers,
                    rarity,
                    iconUrl: `http://${imageBase}/magic/set/icon?auto-adjust&set=${iconSet}&rarity=${rarity}`,
                    name:    currVersion.name[this.$store.getters.locale] ??
                        currVersion.name[this.$store.getters.locales[0]] ?? s,
                    symbolStyle: currVersion.symbolStyle,
                };
            });
        },

        lang: {
            get() { return this.data?.lang ?? this.$route.query.lang ?? this.$store.getters['magic/locale']; },
            set(newValue) {
                const info = this.setInfos.find(i => i.set === this.set);

                if (info.langs.includes(newValue)) {
                    this.$router.replace({ query: { ...this.$route.query, lang: newValue } });
                } else {
                    const info = this.setInfos.find(i => i.langs.includes(newValue));

                    if (info != null) {
                        this.$router.replace({
                            query: {
                                ...this.$route.query,
                                set:    info.set,
                                number: undefined,
                                lang:   newValue,
                            },
                        });
                    }
                }
            },
        },

        set: {
            get() { return this.data?.setId ?? this.$route.query.set; },
            set(newValue) { this.$router.replace({ query: { ...omit(this.$route.query, 'number'), set: newValue } }); },
        },

        number: {
            get() { return this.data?.number ?? this.$route.query.number; },
            set(newValue) { this.$router.replace({ query: { ...this.$route.query, number: newValue } }); },
        },

        partIndex: {
            get() { return parseInt(this.$route.query.part ?? 0); },
            set(newValue) { this.$router.replace({ query: { ...this.$route.query, part: newValue } }); },
        },

        partCount() { return this.data?.parts?.length ?? 1; },

        part() { return this.data?.parts?.[this.partIndex]; },

        layout() { return this.data?.layout; },
        cost() { return this.part?.cost; },

        info() {
            const p = this.part;

            if (p == null) {
                return null;
            }

            if (p.power && p.toughness) {
                return `${p.power}/${p.toughness}`;
            }

            if (p.loyalty) {
                return `[${p.loyalty}]`;
            }

            if (p.handModifier && p.lifeModifier) {
                return `${p.handModifier};${p.lifeModifier}`;
            }

            return null;
        },

        colorIndicator() { return this.part?.colorIndicator; },

        name() { return this.part?.[this.textMode]?.name; },
        typeline() { return this.part?.[this.textMode]?.typeline; },
        text() { return this.part?.[this.textMode]?.text || ''; },

        flavor() { return this.part?.flavorText; },

        artist() { return this.part?.artist; },

        relatedCards() { return this.data?.relatedCards ?? []; },

        relatedCardInfos() {
            return this.relatedCards.map(({ relation, cardId, version, name }) => {
                if (version != null) {
                    return {
                        relation,
                        cardId,
                        name,
                        version,
                        route: {
                            name:   'magic/card',
                            params: { id: cardId },
                            query:  version,
                        },
                    };
                } else {
                    return {
                        relation,
                        cardId,
                        name,
                        route: { name: 'magic/card', params: { id: cardId } },
                    };
                }
            });
        },

        partIcon() {
            switch (this.layout) {
            case 'split':
                if (this.partIndex === 0) {
                    return 'mdi-circle-half-full';
                } else {
                    return 'mdi-circle-half-full mdi-flip-h';
                }
            case 'multipart':
                return 'mdi-text-box-multiple';
            default:
                return null;
            }
        },

        symbolStyle() {
            if (this.textMode !== 'printed') {
                return [];
            } else {
                return this.setInfos.find(i => i.set === this.set)?.symbolStyle ?? [];
            }
        },

        costStyles() {
            if (this.id === 'b_f_m___big_furry_monster_') {
                return [...this.symbolStyle, 'cost', 'mini'];
            } else {
                return [...this.symbolStyle, 'cost'];
            }
        },
    },

    watch: {
        $route: {
            immediate: true,
            handler(newValue, oldValue) {
                if (oldValue == null) {
                    this.loadData();
                    return;
                }

                if (
                    oldValue.params.id !== newValue.params.id ||
                    oldValue.query.lang !== newValue.query.lang ||
                    oldValue.query.set !== newValue.query.set ||
                    oldValue.query.number !== newValue.query.number
                ) {
                    this.loadData();
                }
            },
        },

        id: {
            immediate: true,
            handler() {
                if (this.id === 'capital_offense') {
                    document.body.classList.add('force-lowercase');
                } else {
                    document.body.classList.remove('force-lowercase');
                }
            },
        },
    },

    beforeRouteEnter(to, from, next) {
        next(vm => {
            vm.unsubscribe = vm.$store.subscribe(({ type }) => {
                if (type === 'magic/locale') {
                    vm.loadData();
                }
            });
        });
    },

    beforeRouteLeave(to, from, next) {
        this.unsubscribe?.();
        document.body.classList.remove('force-lowercase');
        next();
    },

    methods: {
        async loadData() {
            const query = omitBy({
                id:     this.$route.params.id,
                lang:   this.$route.query.lang ?? this.$store.getters['magic/locale'],
                set:    this.$route.query.set,
                number: this.$route.query.number,
            }, v => v == null);

            const { data } = await this.apiGet('/magic/card', query);

            this.rotate = null;
            this.data = data;
        },

        toEditor() {
            if (this.isAdmin) {
                this.$router.push({
                    path:  '/magic/data',
                    query: {
                        tab:    'card',
                        id:     this.id,
                        lang:   this.lang,
                        set:    this.set,
                        number: this.number,
                        part:   this.partIndex,
                    },
                });
            }
        },

        switchPart() {
            if (this.partIndex === this.partCount - 1) {
                this.partIndex = 0;
            } else {
                this.partIndex = this.partIndex + 1;
            }
        },
    },
};
</script>

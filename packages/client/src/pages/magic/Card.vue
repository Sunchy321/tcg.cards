<template>
    <q-page class="row q-pa-md">
        <div class="col">
            <div class="row">
                <div class="col-4">
                    <div
                        class="image"
                        :class="[
                            `layout-${layout}`,
                            `part-${partIndex}`,
                            {rotate}
                        ]"
                    >
                        <q-img
                            class="front"
                            :src="imageUrls[0]"
                            :ratio="745/1040"
                            native-context-menu
                        >
                            <template v-slot:error>
                                <div class="card-not-found">
                                    <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                                </div>
                            </template>
                        </q-img>

                        <q-img
                            v-if="imageUrls[1] != null"
                            class="back"
                            :src="imageUrls[1]"
                            :ratio="745/1040"
                            native-context-menu
                        >
                            <template v-slot:error>
                                <div class="card-not-found">
                                    <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                                </div>
                            </template>
                        </q-img>
                    </div>

                    <div
                        v-if="partCount > 1 || ['planar'].includes(layout)"
                        class="image-button"
                    >
                        <q-btn-group v-if="layout==='split'" outline>
                            <q-btn
                                :label="$t('magic.card.layout.another_part')"
                                outline
                                @click="partIndex = { 0: 1, 1: 0 }[partIndex]"
                            />

                            <q-btn
                                :label="$t('magic.card.layout.rotate')"
                                outline
                                @click="rotate = !rotate"
                            />
                        </q-btn-group>

                        <q-btn
                            v-else-if="layout === 'transform'"
                            :label="$t('magic.card.layout.transform')"
                            outline
                            @click="partIndex = { 0: 1, 1: 0 }[partIndex]"
                        />

                        <q-btn
                            v-else-if="layout === 'modal_dfc' || layout === 'art_series'"
                            :label="$t('magic.card.layout.turn_over')"
                            outline
                            @click="partIndex = { 0: 1, 1: 0 }[partIndex]"
                        />

                        <q-btn
                            v-else-if="layout === 'aftermath'"
                            :label="$t('magic.card.layout.rotate')"
                            outline
                            @click="partIndex = { 0: 1, 1: 0 }[partIndex]"
                        />

                        <q-btn
                            v-else-if="layout === 'planar'"
                            :label="$t('magic.card.layout.rotate')"
                            outline
                            @click="rotate = !rotate"
                        />

                        <q-btn
                            v-else
                            :label="$t('magic.card.layout.another_part')"
                            outline
                            @click="partIndex = { 0: 1, 1: 0 }[partIndex]"
                        />
                    </div>

                    <div class="artist-line">
                        {{ artist }}
                    </div>
                </div>

                <div class="col q-px-md">
                    <div class="name-line">
                        <div class="name" :lang="lang">
                            {{ name }}
                        </div>

                        <div class="space" />

                        <div v-if="cost != null" class="cost">
                            <magic-symbol
                                v-for="(s, i) in cost" :key="i"
                                :value="s"
                                :type="s === 'W' ? whiteType : undefined"
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
                        <magic-text :value="text" :tap="tapType" :white="whiteType" />
                    </div>
                    <div v-if="flavor != null" class="flavor-line" :lang="lang">
                        <magic-text :value="flavor" />
                    </div>
                </div>
            </div>
        </div>
        <div class="col-3">
            <div v-if="isAdmin" class="editor-line">
                <q-btn
                    icon="mdi-file-edit"
                    dense flat round
                    @click="toEditor"
                />
            </div>

            <div class="text-mode">
                <q-btn-toggle
                    v-model="textMode"
                    :options="textModeOptions"
                    toggle-color="primary"
                    outline spread
                />
            </div>

            <div class="lang-line">
                <q-btn
                    v-for="i in langInfos" :key="i.lang"
                    class="lang-selector"
                    :disable="i.current || !i.exist"
                    :color="i.exist ? 'primary' : 'grey'"
                    dense
                    :outline="!i.current"
                    :unelevated="i.current"
                    size="sm"
                    :label="i.lang"
                    @click="lang = i.lang"
                />
            </div>

            <div v-if="relatedCards.length > 0" class="related-card-block">
                <div v-for="r in relatedCards" :key="r.cardId" class="related-card">
                    <router-link :to="{ name: 'magic/card', query: { id: r.cardId }}">
                        {{ r.name }}
                    </router-link>
                </div>
            </div>

            <div class="set-block">
                <div
                    v-for="s in sets" :key="s" v-ripple class="set-line"
                    @click="set = s"
                >
                    <div v-if="s === set" class="set-dot" />
                    <span>{{ s }}</span>
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

.editor-line
    margin-bottom 10px

.text-mode
    & > *
        width 100%

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

.image
    transition transform 0.5s

    &.rotate
        transform rotate(90deg) scale(745/1040)

    &.layout-aftermath.part-1
        transform rotate(-90deg) scale(745/1040)

    &.layout-transform, &.layout-modal_dfc, &.layout-art_series
        position relative
        padding-bottom calc(100% / (745/1040))

        transform-style preserve-3d

        & > .front, & > .back
            position absolute
            top 0
            left 0

            backface-visibility hidden

        & > .front
            transform rotateY(0deg)

        & > .back
            transform rotateY(180deg)

        &.part-1
            transform rotateY(180deg)

.card-not-found
    width 100%
    background-color transparent !important
    padding 0 !important

.name
    display inline

.cost
    display inline-flex
    align-items center

    & > *
        margin-right 3px
        border-radius 100px
        box-shadow -2px 2px 0 rgba(0,0,0,0.85)

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
    background-color $primary

    position absolute
    left -5px
    transform translateY(50%)
</style>

<script>
import basic from 'src/mixins/basic';

import MagicColor from 'components/magic/Color';
import MagicText from 'components/magic/Text';
import MagicSymbol from 'components/magic/Symbol';

import { omitBy, uniq } from 'lodash';
import mapComputed from 'src/store/map-computed';

import { imageBase } from 'boot/backend';

export default {
    name: 'Card',

    components: { MagicColor, MagicText, MagicSymbol },

    mixins: [basic],

    data: () => ({
        unsubscribe: null,

        data:   null,
        rotate: false,
    }),

    computed: {
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
            return uniq(this.versions.map(v => v.lang)).sort((a, b) => locales.indexOf(a) - locales.indexOf(b));
        },

        langInfos() {
            const locales = this.$store.getters['magic/locales'];

            const langs = uniq([
                ...this.$store.getters['magic/data'].basicLocales,
                ...this.versions.map(v => v.lang),
            ]).sort((a, b) => locales.indexOf(a) - locales.indexOf(b));

            return langs.map(l => ({
                lang:    l,
                exist:   this.versions.filter(v => v.set === this.set).some(v => v.lang === l),
                current: l === this.lang,
            }));
        },

        sets() { return uniq(this.versions.map(v => v.set)); },

        lang: {
            get() { return this.data?.lang ?? this.$route.query.lang ?? this.$store.getters['magic/locale']; },
            set(newValue) { this.$router.replace({ query: { ...this.$route.query, lang: newValue } }); },
        },

        set: {
            get() { return this.data?.setId ?? this.$route.query.set; },
            set(newValue) { this.$router.replace({ query: { ...this.$route.query, set: newValue } }); },
        },

        number: {
            get() { return this.data?.number ?? this.$route.query.number; },
            set(newValue) { this.$router.replace({ query: { ...this.$route.query, number: newValue } }); },
        },

        partIndex: {
            get() { return this.$route.query.part ?? 0; },
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

        imageUrls() {
            switch (this.layout) {
            case 'transform':
            case 'modal_dfc':
            case 'art_series':
                return [
                    `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}&part=0`,
                    `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}&part=1`,
                ];
            default:
                return [
                    `http://${imageBase}/magic/card?auto-locale&lang=${this.lang}&set=${this.set}&number=${this.number}`,
                ];
            }
        },

        tapType() {
            if (this.textMode !== 'printed') {
                return 'modern';
            }

            switch (this.set) {
            case '3ed':
            case 'sum':
                return 'old1';
            case '4ed':
            case 'rqs':
            case 'itp':
            case '5ed':
            case '6ed':
            case 'me4':
                return 'old2';
            default:
                return 'modern';
            }
        },

        whiteType() {
            if (this.textMode !== 'printed') {
                return 'modern';
            }

            switch (this.set) {
            default:
                return 'modern';
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
    },

    created() {
        this.unsubscribe = this.$store.subscribe(async ({ type, payload }) => {
            if (type === 'magic/locale') {
                this.loadData();
            } else if (type === 'event' && payload === 'randomize') {
                const { data: id } = await this.apiGet('/magic/card/random');

                this.$router.push({
                    name:   'magic/card',
                    params: { id },
                });
            }
        });
    },

    beforeDestroy() {
        this.unsubscribe();
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

            this.rotate = false;
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
    },
};
</script>

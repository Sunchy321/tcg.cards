<template>
    <div
        v-scroll-fire="visible = true"
        class="card-image"
    >
        <div
            class="image"
            :class="[
                `layout-${layout}`,
                `part-${truePart}`,
                { rotated: trueRotate }
            ]"
        >
            <q-img
                v-if="visible"
                class="front"
                :src="imageUrls[0]"
                :ratio="745/1040"
                native-context-menu
            >
                <template v-slot:error>
                    <div class="not-found">
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
                    <div class="not-found">
                        <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                    </div>
                </template>
            </q-img>
        </div>

        <q-btn
            v-if="rotatable"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-right"
            @click.prevent.stop="trueRotate = !trueRotate"
        />

        <q-btn
            v-if="turnable"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-3d-variant"
            @click.prevent.stop="truePart = { 1:0, 0:1 }[truePart]"
        />

        <q-btn
            v-if="layout === 'flip'"
            class="control"
            color="white"
            outline dense round
            icon="mdi-autorenew"
            @click.prevent.stop="truePart = { 1:0, 0:1 }[truePart]"
        />

        <q-btn
            v-if="layout === 'aftermath'"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-right"
            @click.prevent.stop="truePart = { 1:0, 0:1 }[truePart]"
        />
    </div>
</template>

<style lang="stylus" scoped>
.card-image
    position relative

    padding-bottom calc(100% / (745/1040))

.image
    position absolute

    top 0
    left 0
    bottom 0
    right 0

    transition transform 0.5s

    &.rotated
        transform rotate(90deg) scale(745/1040)

    &.layout-flip.part-1
        transform rotate(180deg)

    &.layout-aftermath.part-1
        transform rotate(-90deg) scale(745/1040)

    &.layout-transform
    &.layout-modal_dfc
        transform-style preserve-3d

        & .front
        & .back
            position absolute
            top 0
            left 0

            backface-visibility hidden

        & .front
            transform rotateY(0deg)

        & .back
            transform rotateY(180deg)

        &.part-1
            transform rotateY(180deg)

.not-found
    width 100%
    background-color transparent !important
    padding 0 !important

.control
    position absolute

    top 50%
    right 5%
    transform translateY(-50%)

</style>

<script>
import { imageBase } from 'boot/backend';

export default {
    props: {
        lang:   { type: String, default: null },
        set:    { type: String, default: null },
        number: { type: String, default: null },
        part:   { type: Number, default: null },
        layout: { type: String, default: null },
        rotate: { type: Boolean, default: null },
    },

    data: () => ({
        visible:     null,
        innerPart:   0,
        innerRotate: null,
    }),

    computed: {
        truePart: {
            get() {
                return this.part || this.innerPart;
            },
            set(newValue) {
                this.innerPart = newValue;
                this.$emit('part', newValue);
            },
        },

        defaultRotate() {
            return ['split', 'planar'].includes(this.layout);
        },

        trueRotate: {
            get() {
                return this.rotate ?? this.innerRotate ?? this.defaultRotate;
            },
            set(newValue) {
                this.innerRotate = newValue;
                this.$emit('rotate');
            },
        },

        rotatable() {
            return ['split', 'planar'].includes(this.layout);
        },

        turnable() {
            return ['transform', 'modal_dfc'].includes(this.layout);
        },

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
    },

    watch: {
        layout() {
            this.resetRotate();
        },
    },

    methods: {
        resetRotate() {
            this.innerRotate = null;
        },
    },
};
</script>

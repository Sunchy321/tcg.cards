<template>
    <div
        class="card-image"
        :class="[
            `layout-${layout}`,
            `part-${truePart}`,
            { rotate: trueRotate }
        ]"
    >
        <q-img
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
</template>

<style lang="stylus" scoped>
.card-image
    transition transform 0.5s

    &.rotate
        transform rotate(90deg) scale(745/1040)

    &.layout-flip.part-1
        transform rotate(180deg)

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

.not-found
    width 100%
    background-color transparent !important
    padding 0 !important

</style>

<script>
import { imageBase } from 'boot/backend';

export default {
    props: {
        lang: {
            type:     String,
            required: true,
        },
        set: {
            type:     String,
            required: true,
        },
        number: {
            type:     String,
            required: true,
        },
        part: {
            type:    Number,
            default: null,
        },
        layout: {
            type:     String,
            required: true,
        },
        rotate: {
            type:    Boolean,
            default: null,
        },
    },

    data: () => ({
        innerPart:   0,
        innerRotate: false,
    }),

    computed: {
        truePart: {
            get() {
                return this.part || this.innerPart;
            },
            set(newValue) {
                if (this.part == null) {
                    this.innerPart = newValue;
                } else {
                    this.emit('part', newValue);
                }
            },
        },

        trueRotate: {
            get() {
                return this.rotate ?? this.innerRotate;
            },
            set(newValue) {
                if (this.rotate == null) {
                    this.innerRotate = newValue;
                } else {
                    this.emit('rotate');
                }
            },
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
};
</script>

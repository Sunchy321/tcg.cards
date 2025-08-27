<template>
    <render />
</template>

<script setup lang="ts">
import { Component, h, ref, watch } from 'vue';

import { useGame } from 'src/stores/games';

import { Game, games } from '@model/schema';

import { QInnerLoading } from 'quasar';

import { CardProfile as MagicCardProfile } from '@model/magic/schema/card';

import { last } from 'lodash';

import sorter from '@common/util/sorter';
import { trpc } from 'src/trpc';

const imageComponents = import.meta.glob<Component>('./*/CardImage.vue', {
    eager:  true,
    import: 'default',
});

const props = defineProps<{
    game:   Game;
    cardId: string;
    lang:   string;
}>();

const profile = ref<any>();

watch(props, async () => {
    if (!games.includes(props.game)) {
        profile.value = undefined;
    }

    profile.value = await trpc[props.game].card.profile(props.cardId);
}, { immediate: true });

const render = () => {
    const component = imageComponents[`./${props.game}/CardImage.vue`];

    const game = useGame(props.game)();

    const loading = h('div', h(QInnerLoading));

    if (component == null || profile.value == null) {
        return loading;
    }

    switch (props.game) {
    case 'hearthstone':
        return h(component, { id: props.cardId, lang: props.lang, version: last(profile.value.version[0]) });
    case 'yugioh':
        return h(component, { cardId: props.cardId, lang: props.lang, passcode: profile.value.passcode });
    case 'magic': {
        const versions = (profile.value as MagicCardProfile).versions;

        let availVersion = versions.filter(v => v.lang === props.lang);

        if (availVersion.length == 0) {
            availVersion = versions.filter(v => v.lang === game.locale);
        }

        if (availVersion.length == 0) {
            availVersion = versions.filter(v => v.lang === game.locales[0]);
        }

        if (availVersion.length === 0) {
            availVersion = versions.slice();
        }

        const version = availVersion.sort(sorter.pick<any, 'releaseDate'>('releaseDate', sorter.string))[0];

        return h(component, {
            lang:          version.lang,
            set:           version.set,
            number:        version.number,
            layout:        version.layout,
            fullImageType: version.fullImageType,
        });
    }
    }
};

</script>

<template>
    <render />
</template>

<script setup lang="ts">
import { h, ref, watch } from 'vue';

import { useGame } from 'src/stores/games';

import { Game, games } from '@interface/index';

import { QInnerLoading } from 'quasar';

import { last, mapValues } from 'lodash';
import { defineAsyncComponent } from 'vue';

import sorter from '@common/util/sorter';

const imageComponents = import.meta.glob('./*/CardImage.vue');

const profiles = import.meta.glob('/src/common/*/card.ts', { import: 'default' });

import hearthstoneEntityProfile from 'src/common/hearthstone/entity';

const props = defineProps<{
    game:   Game;
    cardId: string;
    lang:   string;
}>();

const componentMap = mapValues(imageComponents, promise => {
    return defineAsyncComponent(promise);
});

const profile = ref<any>();

watch(props, async () => {
    if (!games.includes(props.game)) {
        profile.value = undefined;
    }

    if (props.game === 'hearthstone') {
        hearthstoneEntityProfile.get(props.cardId, (v: any) => { profile.value = v; });
    } else {
        const profileEntry = await profiles[`/src/common/${props.game}/card.ts`]() as any;

        profileEntry.get(props.cardId, (v: any) => { profile.value = v; });
    }
}, { immediate: true });

const render = () => {
    const component = componentMap[`./${props.game}/CardImage.vue`];

    const game = useGame(props.game)();

    const loading = h('div', h(QInnerLoading));

    if (component == null || profile.value == null) {
        return loading;
    }

    switch (props.game) {
    case 'hearthstone':
        return h(component, { id: props.cardId, lang: props.lang, version: last(profile.value.versions[0]) });
    case 'yugioh':
        return h(component, { cardId: props.cardId, lang: props.lang, passcode: profile.value.passcode });
    case 'magic': {
        const versions = profile.value.versions;

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

        return h(component, { lang: version.lang, set: version.set, number: version.number });
    }
    }
};

</script>

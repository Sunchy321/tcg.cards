<template>
    <q-page class="main q-pa-md">
        <div class="image-column">

            <q-img :src="imageUrl" />
        </div>
        <div class="info-column">
            <div class="name-line row items-center">
                <div v-if="name != null" class="name">
                    {{ name }}
                </div>

                <q-space />

                <div v-if="hasCost" class="cost">
                    <!-- <img class="cost-image" :src="costImage">
                    <div class="cost-text">{{ cost }}</div> -->
                    {{ cost }}
                </div>
            </div>
            <div class="stats-line">
                <div v-if="type != null" class="type">{{ $t('hearthstone.card.type.' + type) }}</div>
                <div v-if="race != null" class="race">{{ $t('hearthstone.card.race.' + race) }}</div>
                <div v-if="stats != null" class="stats">{{ stats }}</div>
            </div>
            <div v-if="text != null" class="text">
                {{ text }}
            </div>
            <div v-if="mechanics.length > 0 || referencedTags.length > 0" class="mechanics">
                <div v-for="m in mechanics" :key="m" class="mechanic">
                    {{ mechanicText(m) }}
                </div>

                <div v-for="r in referencedTags" :key="r" class="referenced-tag">
                    {{ mechanicText(r) }}
                </div>
            </div>
        </div>
        <div class="version-column" />
    </q-page>
</template>

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
        flex: 0 0 300px

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

.text, .mechanics
    margin-top: 30px

// .cost
//     position: relative

//     display: flex
//     justify-content: center
//     align-items: center

//     height: 1.2em

// .cost-image
//     position: absolute

//     height: 1.2em

// .cost-text
//     position: absolute

//     z-index: 100

//     transform: translateY(-5%)

//     font-family: belwe-bold-bt
//     font-size: 130%
//     color: white
//     -webkit-text-stroke: 1px black
//     letter-spacing: -1px

.type
    margin-right: 5px

.race
    margin-right: 5px

.mechanic, .referenced-tag
    display: inline-block

    padding: 2px
    margin-right: 5px
    margin-bottom: 5px

    border-width: 1px
    border-style: solid
    border-radius: 5px

.mechanic
    border-color: $primary

.referenced-tag
    border-color: $secondary

</style>

<script lang="ts">
import {
    defineComponent, ref, computed, watch,
} from 'vue';

import { useRoute } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';
import { useI18n } from 'vue-i18n';

import hearthstoneSetup from 'setup/hearthstone';
import pageSetup from 'setup/page';

import { Entity } from 'interface/hearthstone/entity';

import { omitBy } from 'lodash';

import { apiGet, imageBase } from 'boot/backend';

export default defineComponent({
    name: 'Card',

    setup() {
        const route = useRoute();
        const hearthstone = useHearthstone();
        const i18n = useI18n();

        const { random } = hearthstoneSetup();

        const data = ref<Entity | null>(null);

        // data fields
        const id = computed(() => data.value?.cardId ?? route.params.id);

        const localization = computed(() => {
            const loc = data.value?.localization;

            if (loc == null) {
                return undefined;
            }

            return loc.find(l => l.lang === hearthstone.locale)
            ?? loc.find(l => l.lang === hearthstone.locales[0])
            ?? loc[0];
        });

        const name = computed(() => localization.value?.name);

        pageSetup({
            title: () => name.value ?? '',

            titleType: 'input',

            actions: [
                {
                    action:  'random',
                    icon:    'mdi-shuffle-variant',
                    handler: random,
                },
            ],
        });

        const hasCost = computed(() => {
            if (data.value?.cost == null) {
                return false;
            }

            return true;
        });

        const cost = computed(() => data.value?.cost ?? 0);

        const type = computed(() => data.value?.cardType);
        const race = computed(() => data.value?.race);

        const stats = computed(() => {
            const c = data.value;

            if (c == null) { return null; }
            if (c.attack != null && c.health != null) { return `${c.attack}/${c.health}`; }
            if (c.attack != null && c.durability != null) { return `${c.attack}/${c.durability}`; }
            if (c.armor != null) { return `[${c.armor}]`; }
            if (c.colddown != null) { return `#${c.colddown}`; }

            return null;
        });

        const text = computed(() => localization.value?.text);

        const mechanics = computed(() => (data.value?.mechanics ?? []).filter(v => !v.startsWith('?')));

        const referencedTags = computed(() => (data.value?.referencedTags ?? []).filter(v => !v.startsWith('?')));

        const imageUrl = computed(() => `https://${imageBase}/hearthstone/card?id=${id.value}&lang=${hearthstone.locale}`);

        // methods
        const loadData = async () => {
            const query = omitBy({
                id:     route.params.id,
                number: route.query.version,
            }, v => v == null);

            const { data: result } = await apiGet<Entity>('/hearthstone/card', query);

            data.value = result;
        };

        const mechanicText = (m: string) => {
            if (m.includes(':')) {
                const [mid, arg] = m.split(':');

                return `${i18n.t(`hearthstone.card.mechanic.${mid}`)}:${arg}`;
            } else {
                return i18n.t(`hearthstone.card.mechanic.${m}`);
            }
        };

        // watches
        watch(
            [() => route.params.id, () => route.query.version],
            loadData,

            { immediate: true },
        );

        return {
            name,
            hasCost,
            cost,
            type,
            race,
            stats,
            text,
            mechanics,
            referencedTags,
            imageUrl,

            mechanicText,
        };
    },
});

</script>

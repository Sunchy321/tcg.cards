<template>
    <q-page class="q-pa-md">
        <div class="id code">{{ id }}</div>

        <div v-for="v in data?.diff ?? []" :key="v.dates[0]" class="history">
            <div class="version code">
                <router-link v-if="v.dates.length === 1" :to="versionLink(v.dates[0])" target="_blank">
                    {{ v.dates[0] }}
                </router-link>

                <template v-else>
                    <router-link :to="versionLink(v.dates[0])" target="_blank">
                        {{ v.dates[0] }}
                    </router-link>
                    -
                    <router-link :to="versionLink(v.dates[v.dates.length - 1])" target="_blank">
                        {{ v.dates[v.dates.length - 1] }}
                    </router-link>
                </template>
            </div>

            <rich-text
                v-for="(d, i) in v.text" :key="i"
                :class="`text-${d.type}`"
            >
                {{ d.value }}
            </rich-text>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useGame } from 'src/stores/games/magic';
import { useTitle } from 'store/core';

import RichText from 'src/components/magic/RichText.vue';

import { RuleHistory } from '@model/magic/schema/rule';

import { getValue, trpc } from 'src/hono';

const route = useRoute();
const i18n = useI18n();
const game = useGame();

useTitle(() => i18n.t('magic.rule.history'));

const id = computed(() => route.query.id as string);
const data = ref<RuleHistory>();

watch(id, async () => {
    const value = await getValue(trpc.magic.rule.history, {
        itemId: id.value,
        lang:   game.locale,
    });

    if (value != null) {
        data.value = value as RuleHistory;
    } else {
        data.value = undefined;
    }
}, { immediate: true });

const versionLink = (version: string) => ({
    name:  'magic/rule',
    query: {
        date: version,
    },
    hash: `#${id.value}`,
});

</script>

<style lang="sass" scoped>
.id
    margin-bottom: 15px

.history
    margin-bottom: 25px

.version
    margin-bottom: 5px
    color: grey

*:deep(.text-add)
    background-color: $green-2

*:deep(.text-remove)
    background-color: $red-2

*:deep(.text-dual)
    background-color: $amber-2

.example-icon
    margin-right: 10px
    color: $primary
</style>

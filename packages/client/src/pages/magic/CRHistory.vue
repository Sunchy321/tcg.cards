<template>
    <q-page class="q-pa-md">
        <div class="id code">{{ id }}</div>

        <div v-for="h in data?.result ?? []" :key="h.versions[0]" class="history">
            <div class="version code">
                <router-link v-if="h.versions.length === 1" :to="versionLink(h.versions[0])" target="_blank">
                    {{ h.versions[0] }}
                </router-link>

                <template v-else>
                    <router-link :to="versionLink(h.versions[0])" target="_blank">
                        {{ h.versions[0] }}
                    </router-link>
                    -
                    <router-link :to="versionLink(h.versions[h.versions.length - 1])" target="_blank">
                        {{ h.versions[h.versions.length - 1] }}
                    </router-link>
                </template>
            </div>

            <magic-text
                v-for="(d, i) in h.diff" :key="i"
                :class="`text-${d.type}`"
            >{{ d.value }}</magic-text>

            <template v-if="data?.type === 'content'">
                <div v-for="(e, i) in (h as any).examplesDiff || []" :key="i" class="example">
                    <q-icon name="mdi-chevron-right" class="example-icon" />
                    <magic-text
                        v-for="(v, j) in e" :key="j"
                        :class="`text-${v.type}`"
                    >{{ v.value }}</magic-text>
                </div>
            </template>
        </div>
    </q-page>
</template>

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

<script lang="ts">
import {
    defineComponent, ref, computed, watch,
} from 'vue';

import { Content, Glossary } from 'interface/magic/cr';

import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import MagicText from 'components/magic/Text.vue';

import { apiGet } from 'boot/server';

type ThreeChange = {
    type: 'add' | 'common' | 'dual' | 'remove';
    value: string;
};

type History = {
    type: 'content';
    id: string;
    result: (Omit<Content, 'depth' | 'id'> & { versions: string[], diff: ThreeChange[] })[];
} | {
    type: 'glossary';
    id: string;
    result: (Omit<Glossary, 'ids'> & {
        versions: string[];
        diff: ThreeChange[];
        examplesDiff?: ThreeChange[][];
    })[];
};

export default defineComponent({
    name: 'CRHistory',

    components: { MagicText },

    setup() {
        const route = useRoute();
        const i18n = useI18n();

        pageSetup({
            title: () => i18n.t('magic.cr.history'),
        });

        const id = computed(() => route.query.id);
        const data = ref<History | null>(null);

        watch(id, async () => {
            const { data: result } = await apiGet<History>('/magic/cr/history', {
                id: id.value,
            });

            data.value = result;
        }, { immediate: true });

        const versionLink = (version: string) => ({
            name:  'magic/rule',
            query: {
                date: version,
            },
            hash: `#${id.value}`,
        });

        return {
            id,
            data,

            versionLink,
        };
    },
});
</script>

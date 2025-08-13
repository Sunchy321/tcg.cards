<template>
    <q-page>
        <div class="row items-center q-gutter-md q-pa-md">
            <q-space />
            <q-select v-model="from" dense outlined :options="date" />
            <q-btn icon="mdi-vector-difference" flat dense round @click="loadData" />
            <q-select v-model="to" dense outlined :options="date" />
            <q-space />
        </div>

        <q-splitter v-for="d in diff" :key="d.itemId" v-model="splitter" emit-immediately>
            <template #before>
                <div
                    v-if="d.type !== 'add'"
                    class="q-pa-sm"
                    :class="[
                        `depth-${d.depth[0]}`,
                        ...(isMenu(d) ? ['is-menu'] : []),
                    ]"
                >
                    <span v-if="d.serial[0] != null" :class="d.type ? `text-${d.type}` : ''">{{ d.serial[0] + ' ' }}</span>
                    <span v-else-if="d.itemId.includes(':e')" :class="d.type ? `text-${d.type}` : ''" class="example">EXAMPLE</span>

                    <rich-text
                        v-for="(v, i) in d.text ?? []" :key="i"
                        :class="textClass(v, 'remove')"
                    >
                        {{ textValue(v, 'remove') }}
                    </rich-text>
                </div>
            </template>
            <template #after>
                <div
                    v-if="d.type !== 'remove'"
                    class="q-pa-sm"
                    :class="[
                        `depth-${d.depth[0]}`,
                        ...(isMenu(d) ? ['is-menu'] : []),
                    ]"
                >
                    <span v-if="d.serial[0] != null" :class="d.type ? `text-${d.type}` : ''">{{ d.serial[1] + ' ' }}</span>
                    <span v-else-if="d.itemId.includes(':e')" :class="d.type ? `text-${d.type}` : ''" class="example">EXAMPLE</span>

                    <rich-text
                        v-for="(v, i) in d.text ?? []" :key="i"
                        :class="textClass(v, 'add')"
                    >
                        {{ textValue(v, 'add') }}
                    </rich-text>
                </div>
            </template>
        </q-splitter>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTitle } from 'store/core';

import RichText from 'src/components/magic/RichText.vue';

import { RuleDiff, RuleDiffItem, TextDiff } from '@model/magic/schema/rule';
import { getValue, trpc } from 'src/hono';
import _ from 'lodash';

const router = useRouter();
const route = useRoute();
const i18n = useI18n();

const date = ref<string[]>([]);
const ruleDiff = ref<RuleDiff>();
const splitter = ref(50);

const diff = computed(() => ruleDiff.value?.diff ?? []);

useTitle(() => i18n.t('magic.rule.diff'));

const from = computed({
    get() { return route.query.from as string ?? date.value.slice(-2)[0]; },
    set(newValue: string) {
        if (date.value.includes(newValue) && newValue !== from.value) {
            void router.push({ query: { ...route.query, from: newValue } });
        }
    },
});

const to = computed({
    get() { return route.query.to as string ?? date.value.slice(-1)[0]; },
    set(newValue: string) {
        if (date.value.includes(newValue) && newValue !== to.value) {
            void router.push({ query: { ...route.query, to: newValue } });
        }
    },
});

const loadList = async () => {
    const value = await getValue(trpc.magic.rule.list, {});

    if (value != null) {
        date.value = value;
    }
};

const loadData = async () => {
    const value = await getValue(trpc.magic.rule.diff, {
        from: from.value,
        to:   to.value,
        lang: 'en',
    });

    if (value != null) {
        ruleDiff.value = value as RuleDiff;
    }
};

watch([from, to], loadData, { immediate: true });

onMounted(() => {
    void loadList();
    void loadData();
});

const textClass = (value: TextDiff, type: string) => {
    if (typeof value === 'string') {
        return '';
    } else {
        return `text-${type}`;
    }
};

const textValue = (value: TextDiff, type: string) => {
    if (typeof value === 'string') {
        return value;
    } else {
        return type === 'remove' ? value[0] : value[1];
    }
};

const isMenu = (d: RuleDiffItem) => {
    const last = _.last(d.text)!;

    if (Array.isArray(last)) {
        return /[a-z!]$/.test(last[0]);
    } else {
        return /[a-z!]$/.test(last);
    }
};

</script>

<style lang="sass" scoped>
*:deep(.text-add)
    background-color: $green-2

*:deep(.text-remove)
    background-color: $red-2

*:deep(.text-move)
    background-color: $amber-2

.depth-0.is-menu
    font-size: 200%
    margin-bottom: 30px

.depth-1.is-menu
    font-size: 150%
    margin-bottom: 20px

.depth-2, .depth-3, .depth-4
    margin-bottom: 15px
</style>

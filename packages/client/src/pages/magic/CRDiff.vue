<template>
    <q-page>
        <div class="row items-center q-gutter-md q-pa-md">
            <q-space />
            <q-select v-model="from" dense outlined :options="date" />
            <q-btn icon="mdi-vector-difference" flat dense round @click="loadData" />
            <q-select v-model="to" dense outlined :options="date" />
            <q-space />
        </div>

        <q-splitter v-if="intro.length > 0" v-model="splitter" emit-immediately>
            <template #before>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.intro') }}
                    </div>
                    <rich-text
                        v-for="(v, i) in intro" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >
                        {{ textValue(v, 'remove') }}
                    </rich-text>
                </div>
            </template>
            <template #after>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.intro') }}
                    </div>
                    <rich-text
                        v-for="(v, i) in intro" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >
                        {{ textValue(v, 'add') }}
                    </rich-text>
                </div>
            </template>
        </q-splitter>

        <hr v-if="intro.length > 0">

        <q-splitter v-for="c in contents" :key="c.id" v-model="splitter" emit-immediately>
            <template #before>
                <div
                    v-if="c.type !== 'add'"
                    class="q-pa-sm"
                    :class="`depth-${c.depth[0]}`"
                >
                    <rich-text :class="c.type ? `text-${c.type}` : ''">{{ c.index[0] + ' ' }}</rich-text>

                    <rich-text
                        v-for="(v, i) in c.text ?? []" :key="i"
                        :class="textClass(v, 'remove')"
                    >
                        {{ textValue(v, 'remove') }}
                    </rich-text>

                    <div v-for="(e, i) in c.examples ?? []" :key="i" class="example">
                        <q-icon name="mdi-chevron-right" class="example-icon" />
                        <rich-text
                            v-for="(v, j) in e" :key="j"
                            :class="textClass(v, 'remove')"
                        >
                            {{ textValue(v, 'remove') }}
                        </rich-text>
                    </div>
                </div>
            </template>
            <template #after>
                <div
                    v-if="c.type !== 'remove'"
                    class="q-pa-sm"
                    :class="`depth-${c.depth[1]}`"
                >
                    <rich-text :class="c.type ? `text-${c.type}` : ''">{{ c.index[1] + ' ' }}</rich-text>

                    <rich-text
                        v-for="(v, i) in c.text ?? []" :key="i"
                        :class="textClass(v, 'add')"
                    >
                        {{ textValue(v, 'add') }}
                    </rich-text>

                    <div v-for="(e, i) in c.examples ?? []" :key="i" class="example">
                        <q-icon name="mdi-chevron-right" class="example-icon" />
                        <rich-text
                            v-for="(v, j) in e" :key="j"
                            :class="textClass(v, 'add')"
                        >
                            {{ textValue(v, 'add') }}
                        </rich-text>
                    </div>
                </div>
            </template>
        </q-splitter>

        <hr v-if="glossary.length > 0">

        <q-splitter v-if="glossary.length > 0" v-model="splitter" emit-immediately>
            <template #before>
                <div class="q-pa-sm depth-0">
                    {{ $t('magic.cr.glossary') }}
                </div>
            </template>
            <template #after>
                <div class="q-pa-sm depth-0">
                    {{ $t('magic.cr.glossary') }}
                </div>
            </template>
        </q-splitter>

        <q-splitter
            v-for="g in glossary" :key="'g:' + g.ids.join(' ')"
            v-model="splitter"
            emit-immediately
        >
            <template #before>
                <div
                    v-if="g.type !== 'add'"
                    class="q-pa-sm depth-2"
                >
                    <rich-text :class="g.type ? `text-${g.type}` : ''">{{ g.words.join(', ') }}</rich-text>

                    <br>

                    <rich-text
                        v-for="(v, i) in g.text ?? []" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >
                        {{ textValue(v, 'remove') }}
                    </rich-text>
                </div>
            </template>
            <template #after>
                <div
                    v-if="g.type !== 'remove'"
                    class="q-pa-sm depth-2"
                >
                    <rich-text :class="g.type ? `text-${g.type}` : ''">{{ g.words.join(', ') }}</rich-text>

                    <br>

                    <rich-text
                        v-for="(v, i) in g.text ?? []" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >
                        {{ textValue(v, 'add') }}
                    </rich-text>
                </div>
            </template>
        </q-splitter>

        <hr v-if="credits.length > 0">

        <q-splitter v-if="credits.length > 0" v-model="splitter" emit-immediately>
            <template #before>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.credits') }}
                    </div>

                    <rich-text
                        v-for="(v, i) in credits" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >
                        {{ textValue(v, 'remove') }}
                    </rich-text>
                </div>
            </template>
            <template #after>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.credits') }}
                    </div>

                    <rich-text
                        v-for="(v, i) in credits" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >
                        {{ textValue(v, 'add') }}
                    </rich-text>
                </div>
            </template>
        </q-splitter>

        <hr v-if="csi.length > 0">

        <q-splitter v-if="csi.length > 0" v-model="splitter" emit-immediately>
            <template #before>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.csi') }}
                    </div>

                    <rich-text
                        v-for="(v, i) in csi" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >
                        {{ textValue(v, 'remove') }}
                    </rich-text>
                </div>
            </template>
            <template #after>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.csi') }}
                    </div>

                    <rich-text
                        v-for="(v, i) in csi" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >
                        {{ textValue(v, 'add') }}
                    </rich-text>
                </div>
            </template>
        </q-splitter>
    </q-page>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import RichText from 'src/components/magic/RichText.vue';

import { apiGet } from 'boot/server';

type TextChange = string | [string, string];

interface ContentChange {
    id:       string;
    type?:    'add' | 'move' | 'remove';
    index:    [string | undefined, string | undefined];
    depth:    [number | undefined, number | undefined];
    text:     TextChange[];
    examples: TextChange[][];
}

interface GlossaryChange {
    ids:   string[];
    words: string[];
    type?: 'add' | 'move' | 'remove';
    text?: TextChange[];
}

interface Change {
    intro:    TextChange[];
    contents: ContentChange[];
    glossary: GlossaryChange[];
    credits:  TextChange[];
    csi:      TextChange[];
}

export default defineComponent({
    name: 'CRDiff',

    components: { RichText },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const i18n = useI18n();

        const date = ref<string[]>([]);
        const crDiff = ref<Change | null>(null);
        const splitter = ref(50);

        pageSetup({
            title: () => i18n.t('magic.cr.diff'),
        });

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
            const { data } = await apiGet<string[]>('/magic/cr');

            date.value = data;
        };

        const loadData = async () => {
            const { data: result } = await apiGet<Change>('/magic/cr/diff', {
                from: from.value,
                to:   to.value,
            });

            crDiff.value = result;
        };

        const intro = computed(() => crDiff.value?.intro ?? []);
        const contents = computed(() => crDiff.value?.contents ?? []);
        const glossary = computed(() => crDiff.value?.glossary ?? []);
        const credits = computed(() => crDiff.value?.credits ?? []);
        const csi = computed(() => crDiff.value?.csi ?? []);

        watch([from, to], loadData, { immediate: true });

        onMounted(() => {
            void loadList();
            void loadData();
        });

        const textClass = (value: TextChange, type: string) => {
            if (typeof value === 'string') {
                return '';
            } else {
                return `text-${type}`;
            }
        };

        const textValue = (value: TextChange, type: string) => {
            if (typeof value === 'string') {
                return value;
            } else {
                return type === 'remove' ? value[0] : value[1];
            }
        };

        return {
            splitter,

            date,
            from,
            to,

            loadData,

            intro,
            contents,
            glossary,
            credits,
            csi,

            textClass,
            textValue,
        };
    },
});
</script>

<style lang="sass" scoped>
*:deep(.text-add)
    background-color: $green-2

*:deep(.text-remove)
    background-color: $red-2

*:deep(.text-move)
    background-color: $amber-2

.depth-0
    font-size: 200%
    margin-bottom: 30px

.depth-1
    font-size: 150%
    margin-bottom: 20px

.depth-2
    margin-bottom: 15px

.depth-3
    margin-bottom: 15px

*:deep(.example-icon)
    margin-right: 10px
    color: $primary
</style>

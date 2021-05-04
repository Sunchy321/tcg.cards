<template>
    <q-page>
        <div class="row items-center q-gutter-md q-pa-md">
            <div class="col-grow" />
            <q-select v-model="from" dense outlined :options="date" />
            <q-btn icon="mdi-vector-difference" flat dense round @click="loadData" />
            <q-select v-model="to" dense outlined :options="date" />
            <div class="col-grow" />
        </div>

        <q-splitter v-if="intro.length > 0" v-model="splitter" emit-immediately>
            <template #before class="q-pa-sm">
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.intro') }}
                    </div>
                    <magic-text
                        v-for="(v, i) in intro" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >{{ textValue(v, 'remove') }}</magic-text>
                </div>
            </template>
            <template #after class="q-pa-sm">
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.intro') }}
                    </div>
                    <magic-text
                        v-for="(v, i) in intro" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >{{ textValue(v, 'add') }}</magic-text>
                </div>
            </template>
        </q-splitter>

        <hr v-if="intro.length > 0">

        <q-splitter v-for="c in contents" :key="c.id" v-model="splitter" emit-immediately>
            <template #before class="q-pa-sm">
                <div
                    v-if="c.type !== 'add'"
                    class="q-pa-sm"
                    :class="`depth-${c.depth[0]}`"
                >
                    <magic-text :class="c.type ? `text-${c.type}` : ''">{{ c.index[0] + ' ' }}</magic-text>

                    <magic-text
                        v-for="(v, i) in c.text || []" :key="i"
                        :class="textClass(v, 'remove')"
                    >{{ textValue(v, 'remove') }}</magic-text>

                    <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                        <q-icon name="mdi-chevron-right" class="example-icon" />
                        <magic-text
                            v-for="(v, j) in e" :key="j"
                            :class="textClass(v, 'remove')"
                        >{{ textValue(v, 'remove') }}</magic-text>
                    </div>
                </div>
            </template>
            <template #after class="q-pa-sm">
                <div
                    v-if="c.type !== 'remove'"
                    class="q-pa-sm"
                    :class="`depth-${c.depth[1]}`"
                >
                    <magic-text :class="c.type ? `text-${c.type}` : ''">{{ c.index[1] + ' ' }}</magic-text>

                    <magic-text
                        v-for="(v, i) in c.text || []" :key="i"
                        :class="textClass(v, 'add')"
                    >{{ textValue(v, 'add') }}</magic-text>

                    <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                        <q-icon name="mdi-chevron-right" class="example-icon" />
                        <magic-text
                            v-for="(v, j) in e" :key="j"
                            :class="textClass(v, 'add')"
                        >{{ textValue(v, 'add') }}</magic-text>
                    </div>
                </div>
            </template>
        </q-splitter>

        <hr v-if="glossary.length > 0">

        <q-splitter v-if="glossary.length > 0" v-model="splitter" emit-immediately>
            <template #before class="q-pa-sm">
                <div class="q-pa-sm depth-0">
                    {{ $t('magic.cr.glossary') }}
                </div>
            </template>
            <template #after class="q-pa-sm">
                <div class="q-pa-sm depth-0">
                    {{ $t('magic.cr.glossary') }}
                </div>
            </template>
        </q-splitter>

        <q-splitter v-for="g in glossary" :key="'g:' + g.ids.join(' ')" v-model="splitter" emit-immediately>
            <template #before class="q-pa-sm">
                <div
                    v-if="g.type !== 'add'"
                    class="q-pa-sm depth-2"
                >
                    <magic-text :class="g.type ? `text-${g.type}` : ''">{{ g.words.join(', ') }}</magic-text>

                    <br>

                    <magic-text
                        v-for="(v, i) in g.text || []" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >{{ textValue(v, 'remove') }}</magic-text>
                </div>
            </template>
            <template #after class="q-pa-sm">
                <div
                    v-if="g.type !== 'remove'"
                    class="q-pa-sm depth-2"
                >
                    <magic-text :class="g.type ? `text-${g.type}` : ''">{{ g.words.join(', ') }}</magic-text>

                    <br>

                    <magic-text
                        v-for="(v, i) in g.text || []" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >{{ textValue(v, 'add') }}</magic-text>
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

                    <magic-text
                        v-for="(v, i) in credits" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >{{ textValue(v, 'remove') }}</magic-text>
                </div>
            </template>
            <template #after>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.credits') }}
                    </div>

                    <magic-text
                        v-for="(v, i) in credits" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >{{ textValue(v, 'add') }}</magic-text>
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

                    <magic-text
                        v-for="(v, i) in csi" :key="i"
                        :class="`depth-2 ${textClass(v, 'remove')}`"
                    >{{ textValue(v, 'remove') }}</magic-text>
                </div>
            </template>
            <template #after>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.csi') }}
                    </div>

                    <magic-text
                        v-for="(v, i) in csi" :key="i"
                        :class="`depth-2 ${textClass(v, 'add')}`"
                    >{{ textValue(v, 'add') }}</magic-text>
                </div>
            </template>
        </q-splitter>
    </q-page>
</template>

<style lang="sass" scoped>
*:v-deep(.text-add)
    background-color: $green-2

*:v-deep(.text-remove)
    background-color: $red-2

*:v-deep(.text-move)
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

* ::v-deep .example-icon
    margin-right: 10px
    color: $primary
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import MagicText from 'components/magic/Text.vue';

import { apiGet } from 'boot/backend';

type TextChange = string | [string, string]

interface ContentChange {
    id: string
    type?: 'add' | 'remove' | 'move'
    index: [string | undefined, string | undefined]
    depth: [number | undefined, number | undefined]
    text: TextChange[]
    examples: TextChange[][]
}

interface GlossaryChange {
    ids: string[]
    words: string[],
    type?: 'add' | 'remove' | 'move'
    text?: TextChange[]
}

interface Change {
    intro: TextChange[]
    contents: ContentChange[]
    glossary: GlossaryChange[]
    credits: TextChange[]
    csi: TextChange[]
}

export default defineComponent({
    name: 'CRDiff',

    components: { MagicText },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const i18n = useI18n();

        const date = ref<string[]>([]);
        const data = ref<Change|null>(null);
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
            const { data: result } = await apiGet<Change>('/magic/cr-diff', {
                from: from.value,
                to:   to.value,
            });

            data.value = result;
        };

        const intro = computed(() => { return data.value?.intro ?? []; });
        const contents = computed(() => { return data.value?.contents ?? []; });
        const glossary = computed(() => { return data.value?.glossary ?? []; });
        const credits = computed(() => { return data.value?.credits ?? []; });
        const csi = computed(() => { return data.value?.csi ?? []; });

        watch([from, to], loadData, { immediate: true });
        onMounted(() => { void loadList(); void loadData(); });

        const textClass = (value: TextChange, type: string) => {
            if (typeof value === 'string') {
                return '';
            } else {
                return 'text-' + type;
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

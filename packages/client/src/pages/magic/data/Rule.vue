<template>
    <div class="q-pa-md">
        <div class="buttons row items-center q-gutter-md">
            <q-select
                v-model="date"
                dense outlined
                emit-value map-options
                :options="crOptions"
            >
                <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                        <q-item-section avatar>
                            <q-icon
                                :color="scope.opt.hasData ? 'positive' : 'grey'"
                                :name="scope.opt.hasData ? 'mdi-check' : 'mdi-help'"
                            />
                        </q-item-section>
                        <q-item-section>{{ scope.opt.value }}</q-item-section>
                    </q-item>
                </template>
            </q-select>

            <q-btn
                v-if="!cr.includes(date)"
                label="Parse"
                dense outline
                @click="parse"
            />

            <q-btn
                v-else
                label="Load"
                dense outline
                @click="loadData"
            />

            <q-btn
                label="Save"
                dense outline
                @click="save"
            />

            <q-btn
                v-if="cr.includes(date)"
                label="Reparse"
                dense outline
                @click="reparse"
            />

            <q-btn
                label="All Reparse"
                dense outline
                @click="allReparse"
            />

            <span v-if="duplicatedID.length > 0" class="error">Duplicated ID {{ duplicatedID.join(', ') }}</span>

            <q-space />
        </div>

        <div class="flex items-center q-my-sm q-gutter-md">
            <q-input v-model="oldId" dense outlined />
            <q-icon name="mdi-arrow-right" size="md" />
            <q-input v-model="newId" dense outlined />

            <q-btn flat dense outline @click="renameAll">
                Rename All
            </q-btn>
        </div>

        <q-table
            style="height: 500px"
            :title="contentTitle"
            :rows="contents"
            :columns="contentColumns"
            row-key="id"
            virtual-scroll
            :pagination="{ rowsPerPage: 0 }"
            :filter="contentFilter"
            :rows-per-page-options="[0]"
        >
            <template #top-right>
                <q-input v-model="contentFilter" borderless dense debounce="300">
                    <template #append>
                        <q-icon name="mdi-magnify" />
                    </template>
                </q-input>
            </template>

            <template #body="props">
                <q-tr :props="props">
                    <q-td key="id" :props="props" style="width: 100px; white-space: normal;">
                        {{ props.row.itemId }}
                        <q-popup-edit v-model="props.row.itemId">
                            <defer-input
                                v-model="props.row.itemId"
                                dense
                                autofocus counter
                                @focus="focus"
                            />
                        </q-popup-edit>
                    </q-td>
                    <q-td key="depth" :props="props">
                        {{ props.row.depth }}
                    </q-td>
                    <q-td key="serial" :props="props">
                        {{ props.row.serial }}
                    </q-td>
                    <q-td key="text" :props="props" style="white-space: normal;">
                        <div class="scroll" style="max-height: 120px;">
                            {{ props.row.text }}
                        </div>
                    </q-td>
                    <q-td key="card" :props="props">
                        <q-btn
                            icon="mdi-magnify"
                            flat dense round
                            @click="extractCard(props.row.id)"
                        />
                    </q-td>
                </q-tr>
            </template>
        </q-table>
    </div>
</template>

<script setup lang="ts">
import {
    ref, computed, watch, onMounted,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';

import controlSetup from 'setup/control';

import DeferInput from 'components/DeferInput.vue';

import { Rule } from '@model/magic/schema/rule';

import { last } from 'lodash';

import { trpc } from 'src/trpc';

const router = useRouter();
const route = useRoute();

const { controlGet, controlPost } = controlSetup();

const cr = ref<string[]>([]);
const txt = ref<string[]>([]);
const data = ref<Rule>();

const contentFilter = ref('');

const oldId = ref('');
const newId = ref('');

const date = computed({
    get() {
        return route.query.date as string ?? last(cr.value);
    },
    set(newValue: string) {
        void router.push({ query: { ...route.query, date: newValue } });
    },
});

const crOptions = computed(() => txt.value.map(d => ({
    value:   d,
    label:   d,
    hasData: cr.value.includes(d),
})));

const contents = computed(() => data.value?.contents ?? []);

const contentTitle = computed(() => {
    if (data.value != null) {
        return `Contents (${data.value.date})`;
    } else {
        return 'Contents';
    }
});

const contentColumns = [
    { name: 'id', label: 'ID', field: 'itemId' },
    { name: 'depth', label: 'Depth', field: 'depth' },
    { name: 'serial', label: 'Serial', field: 'serial' },
    { name: 'text', label: 'Text', field: 'text', align: 'left' as const },
    { name: 'card', label: 'Card', field: 'card' },
];

const duplicatedID = computed(() => {
    const ids = contents.value.map(c => c.itemId);

    const count: Record<string, number> = { };

    for (const id of ids) {
        count[id] = (count[id] ?? 0) + 1;
    }

    return Object.keys(count).filter(id => count[id] > 1);
});

const loadData = async () => {
    if (date.value == null || !cr.value.includes(date.value)) {
        data.value = undefined;
        return;
    }

    data.value = await trpc.magic.rule.full(date.value);
};

const loadList = async () => {
    cr.value = await trpc.magic.rule.list();
    txt.value = await trpc.magic.rule.files();

    if (data.value == null) {
        void loadData();
    }
};

const parse = async () => {
    if (date.value == null || cr.value.includes(date.value)) {
        data.value = undefined;
        return;
    }

    data.value = await trpc.magic.rule.parse(date.value);
};

const save = async () => {
    if (data.value == null) {
        return;
    }

    await trpc.magic.rule.save(data.value);

    await loadList();
};

const reparse = async () => {
    // if (date.value != null && cr.value.includes(date.value)) {
    //     const { data: result } = await controlGet<CR>('/magic/cr/reparse', { date: date.value });

    //     data.value = result;
    // }
};

const allReparse = async () => {
    await controlPost('/magic/cr/all-reparse');
};

const extractCard = async (id: string) => {
    await controlGet('/magic/cr/extract-cardname', { date: date.value, id });
};

const renameAll = async () => {
    await controlPost('/magic/cr/rename-all', { old: oldId.value, new: newId.value });
    await loadData();
};

const focus = (e: any) => { e.target.select(); };

watch(date, loadData);
onMounted(loadList);

</script>

<style lang="sass" scoped>
.error
    color: $negative
</style>

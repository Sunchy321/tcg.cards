<template>
    <div class="q-pa-md">
        <div class="q-mb-md">
            <span>{{ key }} {{ current }} / {{ total }}</span>

            <q-btn outline dense class="q-ml-md" @click="acceptAllUpdation">
                Accept All
            </q-btn>

            <q-btn outline dense class="q-ml-md" @click="rejectAllUpdation">
                Reject All
            </q-btn>
        </div>

        <grid
            v-slot="u"
            :value="values" :item-width="200"
            class="legalities"
        >
            <q-card class="q-ma-sm q-pa-sm updation">
                <q-card-actions class="action justify-between">
                    <q-btn icon="mdi-check" flat dense round @click="commitUpdation(u, 'accept')" />
                    <q-btn icon="mdi-close" flat dense round @click="commitUpdation(u, 'reject')" />
                </q-card-actions>

                <q-card-section>{{ u.oldValue ?? '<null>' }}</q-card-section>
                <q-card-section>{{ u.newValue ?? '<null>' }}</q-card-section>

                <q-card-section>
                    <card-avatar :id="u.cardId" :version="versionFor(u)" />
                </q-card-section>
            </q-card>
        </grid>
    </div>
</template>

<script setup lang="ts">

import { ref, computed, onMounted } from 'vue';

import controlSetup from 'setup/control';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

export type ICardUpdation = {
    cardId: string;
    scryfallId: string;
    key: string;
    oldValue: any;
    newValue: any;
};

type CardUpdationData = {
    total: number;
    key: string;
    current: number;
    values: (ICardUpdation & { _id: string })[];
};

const { controlGet, controlPost } = controlSetup();

const data = ref<CardUpdationData>({
    total:   0,
    key:     '',
    current: 0,
    values:  [],
});

const total = computed(() => data.value.total);
const key = computed(() => data.value.key);
const current = computed(() => data.value.current);
const values = computed(() => data.value.values);

const loadData = async () => {
    const { data: result } = await controlGet<CardUpdationData>('/magic/card/get-updation');

    data.value = result;
};

const versionFor = (updation: ICardUpdation) => {
    const lang = /\[([a-z]+)\]/.exec(updation.key)?.[1];

    return lang != null ? { lang } : undefined;
};

const commitUpdation = async (updation: ICardUpdation & { _id: string }, type: string) => {
    await controlPost('/magic/card/commit-updation', {
        id:  updation._id,
        key: updation.key,
        type,
    });

    await loadData();
};

const acceptAllUpdation = async () => {
    const first = values.value[0];

    if (first != null) {
        await controlPost('/magic/card/accept-all-updation', { key: first.key });
        await loadData();
    }
};

const rejectAllUpdation = async () => {
    const first = values.value[0];

    if (first != null) {
        await controlPost('/magic/card/reject-all-updation', { key: first.key });
        await loadData();
    }
};

onMounted(loadData);

</script>

<style lang="sass" scoped>

.updation
    border: 1px solid grey
    border-radius: 5px

    max-width: 200px
    flex-basis: 200px

.action:deep(.q-btn)
    padding: 0

</style>

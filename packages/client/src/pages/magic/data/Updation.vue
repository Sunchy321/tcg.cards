<template>
    <div class="q-pa-md">
        <div class="q-mb-md">
            <span>{{ key }} {{ current }} / {{ total }}</span>

            <q-btn outline dense class="q-ml-md" @click="commitAllUpdation">
                Accept All
            </q-btn>
        </div>

        <grid
            v-slot="u"
            :value="values" :item-width="200"
            class="legalities"
        >
            <q-card class="q-ma-sm q-pa-sm updation">
                <q-card-section>{{ u.oldValue }}</q-card-section>
                <q-card-section>{{ u.newValue }}</q-card-section>

                <q-card-section>
                    <card-avatar
                        :id="u.cardId"
                        :version="{ set: u.set, number: u.number, lang: u.lang }"
                    />
                </q-card-section>

                <q-card-actions class="action justify-between">
                    <q-btn icon="mdi-check" flat dense round @click="commitUpdation(u._id, 'accept')" />
                    <q-btn icon="mdi-close" flat dense round @click="commitUpdation(u._id, 'decline')" />
                </q-card-actions>
            </q-card>
        </grid>
    </div>
</template>

<style lang="sass">

.updation
    border: 1px solid grey
    border-radius: 5px

    max-width: 200px
    flex-basis: 200px

.action .q-btn
    padding: 0

</style>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-use-before-define */
import {
    defineComponent, ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

export type ICardUpdation = {
    cardId: string;
    scryfallId: string;
    key: string;
    partIndex?: number;
    oldValue: any;
    newValue: any;

    set: string;
    number: string;
    lang: string;
};

type CardUpdationData = {
    total: number;
    key: string;
    current: number;
    values: (ICardUpdation & { _id: string })[];
};

export default defineComponent({
    components: { Grid, CardAvatar },

    setup() {
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

        const commitUpdation = async (id: string, type: string) => {
            await controlPost('/magic/card/commit-updation', { id, type });
            await loadData();
        };

        const commitAllUpdation = async () => {
            const first = values.value[0];

            if (first != null) {
                await controlPost('/magic/card/accept-all-updation', { key: first.key });
                await loadData();
            }
        };

        onMounted(loadData);

        return {
            total,
            key,
            current,
            values,

            commitUpdation,
            commitAllUpdation,
        };
    },
});
</script>

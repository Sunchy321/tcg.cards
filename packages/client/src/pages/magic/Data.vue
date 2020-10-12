<template>
    <q-page>
        <q-tabs v-model="tab">
            <q-tab
                v-for="t in tabs"
                :key="t"
                :name="t"
                :label="$t('magic.data.tabs.' + t)"
            />
        </q-tabs>

        <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="scryfall">
                <div class="text-h5">
                    {{ $t('magic.data.scryfall.bulkData') }}
                </div>
            </q-tab-panel>
        </q-tab-panels>
    </q-page>
</template>

<script>
export default {
    data: () => ({
        tab: 'scryfall',
    }),

    computed: {
        tabs() {
            return ['scryfall'];
        },
    },
};
</script>

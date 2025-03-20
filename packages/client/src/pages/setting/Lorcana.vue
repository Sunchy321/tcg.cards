<template>
    <q-page class="q-pa-md">
        <div class="text-h5">{{ $t('lorcana.ui.setting.cache') }}</div>

        <div class="flex q-my-md">
            <q-card class="card q-ma-md">
                <q-card-section class="text-h6">
                    {{ $t('lorcana.card.$self') }}
                </q-card-section>

                <q-card-section>
                    {{ cardCount }}
                </q-card-section>

                <q-card-actions>
                    <q-btn
                        :label="$t('lorcana.ui.setting.clear')"
                        flat dense
                        @click="clearCard"
                    />
                </q-card-actions>
            </q-card>

            <q-card class="card q-ma-md">
                <q-card-section class="text-h6">
                    {{ $t('lorcana.set.$self') }}
                </q-card-section>

                <q-card-section>
                    {{ setCount }}
                </q-card-section>

                <q-card-actions>
                    <q-btn
                        :label="$t('lorcana.ui.setting.clear')"
                        flat dense
                        @click="clearSet"
                    />
                </q-card-actions>
            </q-card>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import cardProfile from 'src/common/lorcana/card';
import setProfile from 'src/common/lorcana/set';

const cardCount = ref(0);
const setCount = ref(0);

const updateCard = async () => { cardCount.value = await cardProfile.count(); };
const updateSet = async () => { setCount.value = await setProfile.count(); };

const clearCard = async () => {
    await cardProfile.clear();
    await updateCard();
};

const clearSet = async () => {
    await setProfile.clear();
    await updateSet();
};

onMounted(async () => {
    await updateCard();
    await updateSet();
});

</script>

<style lang="sass" scoped>
.card
    max-width: 150px
    flex-basis: 150px
</style>

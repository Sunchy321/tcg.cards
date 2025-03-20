<template>
    <q-page class="q-pa-md">
        <div class="text-h5">{{ $t('magic.ui.setting.cache') }}</div>

        <div class="flex q-my-md">
            <q-card class="card q-ma-md">
                <q-card-section class="text-h6">
                    {{ $t('magic.card.$self') }}
                </q-card-section>

                <q-card-section>
                    {{ cardCount }}
                </q-card-section>

                <q-card-actions>
                    <q-btn
                        :label="$t('magic.ui.setting.clear')"
                        flat dense
                        @click="clearCard"
                    />
                </q-card-actions>
            </q-card>

            <q-card class="card q-ma-md">
                <q-card-section class="text-h6">
                    {{ $t('magic.set.$self') }}
                </q-card-section>

                <q-card-section>
                    {{ setCount }}
                </q-card-section>

                <q-card-actions>
                    <q-btn
                        :label="$t('magic.ui.setting.clear')"
                        flat dense
                        @click="clearSet"
                    />
                </q-card-actions>
            </q-card>
        </div>
    </q-page>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';

import cardProfile from 'src/common/magic/card';
import setProfile from 'src/common/magic/set';

export default defineComponent({
    name: 'MagicSetting',

    setup() {
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

        return {
            cardCount,
            setCount,

            clearCard,
            clearSet,
        };
    },
});
</script>

<style lang="sass" scoped>

.card
    max-width: 150px
    flex-basis: 150px

</style>

<template>
    <q-page>
        <div class="main-input q-ma-xl">
            <q-input filled size="md" />
        </div>
        <div />
    </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useI18n } from 'vue-i18n';

import hearthstoneSetup from 'setup/hearthstone';
import pageSetup from 'setup/page';

export default defineComponent({
    name: 'Hearthstone',

    setup() {
        const i18n = useI18n();

        const { random } = hearthstoneSetup();

        pageSetup({
            title:   () => i18n.t('hearthstone.$self'),
            actions: [
                {
                    action:  'random',
                    icon:    'mdi-shuffle-variant',
                    handler: random,
                },
            ],
        });
    },
});
</script>

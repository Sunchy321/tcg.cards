<template>
    <q-page>
        <div class="q-pa-md" style="font-size: 150%">Scryfall</div>
        <div class="q-pa-md row">
            <q-btn @click="getScryfall">
                {{ $t('magic.$control.get-bulk.scryfall') }}
            </q-btn>
        </div>
    </q-page>
</template>

<script>
export default {
    name: 'GetBulk',

    methods: {
        getScryfall() {
            this.$axios.post('/control/magic/get-scryfall-bulk');
        }
    }
};
</script>

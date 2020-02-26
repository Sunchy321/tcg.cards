<template>
    <q-page>
        <q-uploader
            class="q-ma-md"
            auto-upload
            url="/action/hearthstone/parse-log"
            accept=".log"
            @uploaded="fileUploaded"
        />

        <div class="q-ma-md">
            {{ JSON.stringify(data) }}
        </div>
    </q-page>
</template>

<script>
export default {
    name: 'LogParser',

    data() {
        return {
            data: null
        };
    },

    methods: {
        fileUploaded({ xhr }) {
            this.data = JSON.parse(xhr.response);
        }
    }
};
</script>

<style>

</style>

<template>
    <q-btn
        :icon="icon" flat dense
        round
    >
        <q-popup-proxy v-model="showPopup">
            <q-uploader
                ref="uploader"
                :url="url"
                :accept="accept"
                auto-upload
                @uploading="onUploading"
                @uploaded="onUploaded"
                @failed="onFailed"
            />
        </q-popup-proxy>
    </q-btn>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';

import { QUploader } from 'quasar';

export default defineComponent({
    name: 'UploadBtn',

    props: {
        icon: {
            type:    String,
            default: undefined,
        },

        url: {
            type:     String,
            required: true,
        },

        accept: {
            type:    String,
            default: undefined,
        },
    },

    emits: ['uploading', 'uploaded', 'failed'],

    setup(props, { emit }) {
        const uploader = ref<QUploader | null>(null);
        const showPopup = ref(false);

        const onUploading = (...args: any[]) => { emit('uploading', ...args); };

        const onUploaded = (...args: any[]) => {
            emit('uploaded', ...args);
            showPopup.value = false;
        };

        const onFailed = (...args: any[]) => {
            emit('failed', ...args);
            showPopup.value = false;
        };

        watch(uploader, value => {
            if (value != null) {
                value.pickFiles();
            }
        });

        return {
            uploader,
            showPopup,

            onUploading,
            onUploaded,
            onFailed,
        };
    },
});
</script>

<template>
    <q-page>
        <div class="main-content">
            <!-- <div
                v-for="(item, index) in log" :key="index"
                class="item"
                :class="item.type"
            >
                <div class="date" :class="{ placeholder: !showDate(index) }">
                    {{ item.date }}
                </div>

                <div class="content">
                    <template v-if="item.type === 'unknown'">
                        {{ item.method + ' - ' + item.text }}
                    </template>
                </div>
            </div> -->

            <pre>{{ prettify(log) }}</pre>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { useCore, useTitle } from 'store/core';

import { apiBase } from 'boot/server';

const i18n = useI18n();
const quasar = useQuasar();
const core = useCore();

const log = ref<any>([]);

useTitle(() => i18n.t('hearthstone.ui.log-parse.$self'));

core.actions = [
    {
        action: 'upload',
        icon:   'mdi-upload',
        popup:  {
            type:   'file',
            url:    `${apiBase}/hearthstone/log-parse`,
            accept: '.log',
        },
        handler: {
            uploaded: ({ xhr }: { file: File[], xhr: XMLHttpRequest }) => {
                log.value = JSON.parse(xhr.response);
            },
            failed: ({ xhr }: { file: File[], xhr: XMLHttpRequest }) => {
                quasar.notify({
                    type:    'negative',
                    message: xhr.response,
                });
            },
        },
    },
];

const prettify = (value: any) => JSON.stringify(value, null, 4);

</script>

<style lang="sass" scoped>
.main-content
    padding: 5px

.item
    margin-bottom: 2px

    border-width: 1px
    border-style: solid
    border-radius: 5px

    &.unknown
        color: grey

.date, .content
    display: inline

.date
    margin-right: 5px

    &.placeholder
        color: transparent

</style>

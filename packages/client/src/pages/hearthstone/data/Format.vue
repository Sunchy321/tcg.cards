<template>
    <div class="q-pa-md">
        <div class="row items-center">
            <q-select
                v-model="format"
                :options="formats"
                dense outlined
            />

            <q-space />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="saveFormat"
            />
        </div>

        <div class="row items-center q-mt-md">
            <date-input
                v-model="birthday"
                class="q-ml-md"
                outlined dense
            >
                <template #before>
                    <q-icon name="mdi-cake" />
                </template>
            </date-input>

            <date-input
                v-model="deathdate"
                class="q-ml-md"
                outlined dense
            >
                <template #before>
                    <q-icon name="mdi-grave-stone" />
                </template>
            </date-input>
        </div>
    </div>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

import { Format } from '@interface/hearthstone/format';

import { apiGet } from 'boot/server';

export default defineComponent({
    name: 'DataFormat',

    components: { DateInput },

    setup() {
        const { controlPost } = controlSetup();

        const formatList = ref<string[]>([]);
        const formatId = ref<string | null>(null);
        const format = ref<Format | null>(null);

        const birthday = computed({
            get() { return format.value?.birthday ?? ''; },
            set(newValue: string) {
                if (format.value != null) {
                    format.value.birthday = newValue;
                }
            },
        });

        const deathdate = computed({
            get() { return format.value?.deathdate ?? ''; },
            set(newValue: string) {
                if (format.value != null) {
                    format.value.deathdate = newValue;
                }
            },
        });

        const loadData = async () => {
            const { data } = await apiGet<string[]>('/hearthstone/format');

            formatList.value = data;

            if (formatId.value == null) {
                formatId.value = formatList.value[0];
            }
        };

        const loadFormat = async () => {
            if (formatId.value != null) {
                const { data: result } = await apiGet<Format>('/hearthstone/format', {
                    id: formatId.value,
                });

                format.value = result;
            }
        };

        const saveFormat = async () => {
            await controlPost('/hearthstone/format/save', { data: format.value });
            await loadFormat();
        };

        watch(formatId, loadFormat);
        onMounted(loadData);

        return {
            formats: formatList,
            format:  formatId,
            birthday,
            deathdate,

            saveFormat,
        };
    },

});
</script>

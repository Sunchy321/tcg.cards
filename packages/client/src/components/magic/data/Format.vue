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

        <div class="row items-center q-my-md q-gutter-md">
            <span>Birthday</span>
            <date-input
                v-model="birthday"
                dense
            />

            <span>Deathdate</span>
            <date-input
                v-model="deathdate"
                dense
            />
        </div>
    </div>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

import { apiGet } from 'boot/backend';

interface Format {
    formatId: string;
    localization: { lang: string, name: string }[];
    sets: string[];
    banlist: { card: string, status: string, date: string, source?: string }[];
    birthday?: string;
    deathdate?: string;
}

export default defineComponent({
    name: 'DataFormat',

    components: { DateInput },

    setup() {
        const { controlPost } = controlSetup();

        const formatList = ref<string[]>([]);
        const formatId = ref<string | null>(null);
        const format = ref<Format | null>(null);

        const birthday = computed({
            get() {
                return format.value?.birthday ?? '';
            },
            set(newValue: string) {
                if (format.value != null) {
                    format.value.birthday = newValue;
                }
            },
        });

        const deathdate = computed({
            get() {
                return format.value?.deathdate ?? '';
            },
            set(newValue: string) {
                if (format.value != null) {
                    format.value.deathdate = newValue;
                }
            },
        });

        const loadData = async () => {
            const { data } = await apiGet<string[]>('/magic/format');

            formatList.value = data;

            if (formatId.value == null) {
                [formatId.value] = formatList.value;
            }
        };

        const loadFormat = async () => {
            if (formatId.value != null) {
                const { data: result } = await apiGet<Format>('/magic/format', {
                    id: formatId.value,
                });

                format.value = result;
            }
        };

        const saveFormat = async () => {
            await controlPost('/magic/format/save', { data: format.value });
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

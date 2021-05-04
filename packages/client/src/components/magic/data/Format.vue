<template>
    <div class="q-pa-md">
        <div class="row items-center">
            <q-select
                v-model="format"
                :options="formats"
                dense outlined
            />

            <div class="col-grow" />

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
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

import { apiGet } from 'boot/backend';

interface Format {
    formatId: string;
    localization: { lang: string, name: string }[];
    sets: string[],
    banlist: { card: string, status: string, date: string, source?: string }[],
    birthday?: string;
    deathdate?: string;
}

export default defineComponent({
    name: 'DataFormat',

    components: { DateInput },

    setup() {
        const { controlPost } = controlSetup();

        const formats = ref<string[]>([]);
        const format = ref<string|null>(null);
        const data = ref<Format|null>(null);

        const birthday = computed({
            get() {
                return data.value?.birthday ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.birthday = newValue;
                }
            },
        });

        const deathdate = computed({
            get() {
                return data.value?.deathdate ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.deathdate = newValue;
                }
            },
        });

        const loadData = async () => {
            const { data } = await apiGet<string[]>('/magic/format');

            formats.value = data;

            if (format.value == null) {
                format.value = formats.value[0];
            }
        };

        const loadFormat = async () => {
            if (format.value != null) {
                const { data: result } = await apiGet<Format>(`/magic/format/${format.value}`);

                data.value = result;
            }
        };

        const saveFormat = async () => {
            await controlPost('/magic/format/save', { data: data.value });
            await loadFormat();
        };

        watch(format, loadFormat);
        onMounted(loadData);

        return {
            formats,
            format,
            birthday,
            deathdate,

            saveFormat,
        };
    },

});
</script>

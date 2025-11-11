<template>
    <div class="q-pa-md">
        <div class="row items-center">
            <q-select
                v-model="format"
                :options="formatList"
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
            <q-checkbox v-model="isEternal" label="Eternal" />

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

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

import { Format } from '@model/lorcana/schema/format';

import { trpc } from 'src/trpc';

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

const isEternal = computed({
    get() { return format.value?.tags?.includes('eternal') ?? false; },
    set(newValue: boolean) {
        if (format.value == null) {
            return;
        }

        if (newValue) {
            if (!format.value.tags.includes('eternal')) {
                format.value.tags.push('eternal');
            }
        } else {
            format.value.tags = format.value.tags.filter(t => t !== 'eternal');
        }
    },
});

const loadData = async () => {
    formatList.value = await trpc.lorcana.format.list();

    if (formatId.value == null) {
        formatId.value = formatList.value[0];
    }
};

const loadFormat = async () => {
    if (formatId.value == null) {
        return;
    }

    format.value = await trpc.lorcana.format.full({ formatId: formatId.value });
};

const saveFormat = async () => {
    await controlPost('/lorcana/format/save', { data: format.value });
    await loadFormat();
};

watch(formatId, loadFormat);
onMounted(loadData);

</script>

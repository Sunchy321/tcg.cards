<template>
    <div class="q-pa-md">
        <div v-if="progress != null" class="row items-center q-mb-md">
            <div class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
                class="col-grow"
            />
        </div>

        <div class="row q-gutter-md q-mb-lg">
            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Card Localizations Missing</q-item-section>
                    <q-item-section side>
                        {{ missingCount.cardLocalization }}
                    </q-item-section>
                </q-item>
            </q-list>
            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Card Part Localizations Missing</q-item-section>
                    <q-item-section side>
                        {{ missingCount.cardPartLocalization }}
                    </q-item-section>
                </q-item>
            </q-list>
        </div>

        <div class="row items-center q-gutter-md">
            <q-input
                v-model.number="importLimit"
                type="number"
                label="Import Limit"
                outlined
                dense
                clearable
                class="col-3"
            />

            <q-btn
                color="primary"
                label="Import from MTGCH API"
                icon="mdi-download"
                flat dense outline
                :loading="isImporting"
                :disable="isImporting || isImportingAtomic"
                @click="startImport"
            />

            <q-btn
                color="secondary" label="Import from atomic_zhs.json" icon="mdi-file-download" flat dense outline
                :loading="isImportingAtomic" :disable="isImporting || isImportingAtomic" @click="startImportAtomic"
            />
        </div>

        <div v-if="importStats.length > 0" class="q-mt-lg">
            <div class="text-subtitle2 q-mb-sm">Import Statistics</div>
            <q-list bordered separator>
                <q-item v-for="(stat, index) in importStats" :key="index">
                    <q-item-section>
                        <q-item-label>{{ 'step' in stat ? (stat.step === 'card' ? 'Card Localization' : 'Card Part Localization') : 'Atomic ZHS Import' }}</q-item-label>
                        <q-item-label caption>
                            {{ stat.message }}
                        </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                        <q-item-label>Success: {{ stat.success }}</q-item-label>
                        <q-item-label caption>Failed: {{ stat.failed }}</q-item-label>
                    </q-item-section>
                </q-item>
            </q-list>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { trpc } from 'src/trpc';

interface ImportProgress {
    type:     'progress' | 'complete' | 'error';
    step:     'card' | 'part';
    current:  number;
    total:    number;
    success:  number;
    failed:   number;
    message?: string;
}

interface ImportAtomicProgress {
    type:     'progress' | 'complete' | 'error';
    current:  number;
    total:    number;
    success:  number;
    failed:   number;
    message?: string;
}

const missingCount = ref({
    cardLocalization:     0,
    cardPartLocalization: 0,
});

const progress = ref<ImportProgress | ImportAtomicProgress | null>(null);
const importLimit = ref<number | undefined>(undefined);
const isImporting = ref(false);
const isImportingAtomic = ref(false);
const importStats = ref<(ImportProgress | ImportAtomicProgress)[]>([]);

const progressValue = computed(() => {
    const prog = progress.value;

    if (prog?.total != null && prog.total > 0) {
        return prog.current / prog.total;
    } else {
        return undefined;
    }
});

const progressLabel = computed(() => {
    const prog = progress.value;

    if (prog != null) {
        let stepLabel = 'Import';

        if ('step' in prog) {
            stepLabel = prog.step === 'card' ? 'Card Localization' : 'Card Part Localization';
        } else {
            stepLabel = 'Atomic ZHS Import';
        }

        if (prog.type === 'error') {
            return `[${stepLabel}] Error: ${prog.message ?? 'Unknown error'}`;
        }

        let result = `[${stepLabel}] ${prog.current}/${prog.total}`;
        result += ` (Success: ${prog.success}, Failed: ${prog.failed})`;

        if (prog.type === 'complete') {
            result = `✓ ${result}`;
        }

        return result;
    } else {
        return '';
    }
});

const loadMissingCount = async () => {
    missingCount.value = await trpc.magic.data.mtgch.countMissingLocalization();
};

const startImport = async () => {
    if (isImporting.value) return;

    isImporting.value = true;
    importStats.value = [];
    progress.value = null;

    try {
        const sse = await trpc.magic.data.mtgch.importLocalization({
            limit: importLimit.value,
        });

        for await (const msg of sse) {
            progress.value = msg;

            if (msg.type === 'complete' || msg.type === 'error') {
                importStats.value.push(msg);
            }
        }

        // Refresh count after import
        await loadMissingCount();
    } finally {
        isImporting.value = false;
    }
};

const startImportAtomic = async () => {
    if (isImportingAtomic.value) return;

    isImportingAtomic.value = true;
    importStats.value = [];
    progress.value = null;

    try {
        const sse = await trpc.magic.data.mtgch.importAtomicZhs({
            limit: importLimit.value,
        });

        for await (const msg of sse) {
            progress.value = msg;

            if (msg.type === 'complete' || msg.type === 'error') {
                importStats.value.push(msg);
            }
        }

        // Refresh count after import
        await loadMissingCount();
    } finally {
        isImportingAtomic.value = false;
    }
};

onMounted(loadMissingCount);
</script>

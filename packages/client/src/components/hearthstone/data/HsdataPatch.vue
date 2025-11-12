<template>
    <div class="hsdata-patch row items-center">
        <div class="name">{{ name }}</div>

        <q-btn
            class="clear-button"
            flat round dense
            icon="mdi-close"
            @click="clearPatch"
        />

        <q-btn
            class="load-button" :class="{ 'is-updated': isUpdated }"
            flat round dense
            icon="mdi-import"
            @click="loadPatch"
        />

        <q-circular-progress
            v-show="progress !== undefined"
            :indeterminate="progress === null"
            :value="progressValue"
            font-size="8px"
            :max="1"
            :thickness="0.3"
            color="primary"
            track-color="transparent"
        />

        <span v-show="progress != null" class="q-pl-sm">{{ progressLabel }}</span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useQuasar } from 'quasar';

import { PatchProgress } from 'card-model/data/hearthstone/schema/data/hsdata';

import { trpc } from 'src/trpc';

const quasar = useQuasar();

const props = defineProps<{
    buildNumber: number;
    name:        string;
    isUpdated:   boolean;
}>();

const emit = defineEmits<{
    'load-data': [void];
}>();

const progress = ref<PatchProgress>();

const progressValue = computed(() => {
    if (progress.value == null) {
        return 0;
    } else {
        return progress.value.count / progress.value.total;
    }
});

const progressLabel = computed(() => {
    if (progress.value == null) {
        return '';
    } else {
        return `${progress.value.count}/${progress.value.total}`;
    }
});

const clearPatch = async () => {
    const result = await trpc.hearthstone.data.hsdata.clearPatch(props.buildNumber);

    quasar.notify({
        message: `Patch ${props.buildNumber} has been cleared, ${result.deletedEntity.length} entities and ${result.deletedEntityLocalization.length} localizations removed.`,
        color:   'positive',
    });

    emit('load-data');
};

const loadPatch = async () => {
    for await (const prog of await trpc.hearthstone.data.hsdata.loadPatch(props.buildNumber)) {
        progress.value = prog;
    }

    progress.value = undefined;
    emit('load-data');
};

</script>

<style lang="sass" scoped>
.name
    width: 100px

.duplicate
    color: red

.load-button.is-updated
    color: green

</style>

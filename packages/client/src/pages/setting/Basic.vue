<template>
    <q-page class="q-pa-md">
        <div class="row items-center">
            {{ $t('setting.lang') }}
            <q-select
                v-model="locale"
                class="q-ml-sm"
                style="width: 150px"
                dense outlined
                emit-value map-options
                :options="localeOptions"
            >
                <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                        <q-item-section side class="code">
                            {{ scope.opt.value }}
                        </q-item-section>
                        <q-item-section no-wrap>
                            {{ scope.opt.label }}
                        </q-item-section>
                    </q-item>
                </template>
            </q-select>
        </div>

        <h5>{{ $t('setting.api-key.$self') }}</h5>

        <div class="row items-center">
            <q-space />

            <q-input v-model="newApiKeyName" dense outlined />

            <q-btn
                class="q-ml-sm"
                icon="mdi-plus"
                flat dense round
                :disable="newApiKeyName === ''"
                @click="createApiKey"
            />
        </div>

        <q-table
            v-if="apiKey != null"
            class="q-mt-md"
            :rows="apiKey"
            row-key="id"
            :no-data-label="$t('no-data')"
            :no-results-label="$t('no-results')"
            :loading="apiKey == null"
            :pagination="{ rowsPerPage: 10 }"
        >
            <template #header>
                <q-tr>
                    <q-th>{{ $t('setting.api-key.name') }}</q-th>
                    <q-th>{{ $t('setting.api-key.created-at') }}</q-th>
                    <q-th style="width: 50px">{{ $t('setting.api-key.delete') }}</q-th>
                </q-tr>
            </template>
            <template #body="props">
                <q-tr>
                    <q-td>{{ props.row.name }}</q-td>
                    <q-td>{{ props.row.createdAt.toString('') }}</q-td>
                    <q-td>
                        <q-btn
                            icon="mdi-delete"
                            size="sm"
                            color="negative"
                            flat dense round
                            @click="deleteApiKey(props.row.id)"
                        />
                    </q-td>
                </q-tr>
            </template>
        </q-table>

        <q-dialog
            v-model="showCreateDialog"
            persistent
            size="md"
            @hide="newKey = ''"
        >
            <q-card style="min-width: 800px;">
                <q-card-section>
                    <div class="text-h6">{{ $t('setting.api-key.create-success') }}</div>
                </q-card-section>

                <q-card-section>
                    <div class="text-weight-bold">{{ $t('setting.api-key.create-hint') }}</div>
                </q-card-section>

                <q-card-section>
                    <div class="row items-center">
                        <q-btn
                            class="q-mr-sm"
                            icon="mdi-content-copy"
                            size="sm"
                            flat dense round
                            @click="copyApiKey"
                        />

                        {{ newKey }}
                    </div>
                </q-card-section>

                <q-card-actions align="right">
                    <q-btn v-close-popup flat label="OK" color="primary" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <q-dialog
            v-model="showDeleteDialog"
            persistent
            size="md"
            @hide="cleanDeleteDialog"
        >
            <q-card style="min-width: 800px;">
                <q-card-section>
                    <div class="text-h6">{{ $t('setting.api-key.delete-key') }}</div>
                </q-card-section>

                <q-card-section>
                    <div class="text-weight-bold">{{ $t('setting.api-key.delete-hint', { name: deleteKeyName }) }}</div>
                </q-card-section>

                <q-card-section>
                    <q-input
                        v-model="deleteKeyRepeat"
                        dense outlined
                        :rules="[validateDeleteKey]"
                    />
                </q-card-section>

                <q-card-actions align="right">
                    <q-btn
                        v-close-popup
                        flat dense
                        :label="$t('setting.api-key.cancel')"
                    />

                    <q-btn
                        v-close-popup
                        flat dense
                        :label="$t('setting.api-key.delete')" color="negative"
                        :disable="!validateDeleteKey(deleteKeyRepeat)"
                        @click="deleteApiKeyConfirm"
                    />
                </q-card-actions>
            </q-card>
        </q-dialog>
    </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { copyToClipboard, useQuasar } from 'quasar';
import { useCore } from 'store/core';
import { useI18n } from 'vue-i18n';

import { auth } from '@/auth';

type ApiKey = {
    id:        string;
    name:      string | null;
    createdAt: Date;
};

const quasar = useQuasar();
const core = useCore();
const i18n = useI18n();

const locale = computed({
    get() { return core.locale; },
    set(newValue: string) { core.locale = newValue; },
});

const localeOptions = computed(() => core.locales.map(l => ({
    value: l,
    label: i18n.t('lang.$self', '', { locale: l }),
})));

const session = auth.useSession();

const apiKey = ref<ApiKey[]>([]);

const refreshApiKey = async () => {
    const { data, error } = await auth.apiKey.list();

    if (error != null) {
        quasar.notify({
            type:    'negative',
            message: error.message,
        });
    } else {
        apiKey.value = data;
    }
};

watch(session, refreshApiKey, { immediate: true });

// Create API Key
const newApiKeyName = ref('');

const showCreateDialog = ref(false);
const newKey = ref('');

const createApiKey = async () => {
    if (newApiKeyName.value === '') {
        return;
    }

    const { data, error } = await auth.apiKey.create({
        name: newApiKeyName.value,
    });

    if (error != null) {
        quasar.notify({
            type:    'negative',
            message: error.message,
        });

        return;
    }

    refreshApiKey();
    newApiKeyName.value = '';
    newKey.value = data.key;
    showCreateDialog.value = true;
};

const copyApiKey = () => {
    if (newKey.value === '') {
        return;
    }

    copyToClipboard(newKey.value);

    quasar.notify({
        type:    'positive',
        message: i18n.t('setting.api-key.copied'),
    });
};

// Delete API Key
const showDeleteDialog = ref(false);
const deleteKeyId = ref('');
const deleteKeyRepeat = ref('');

const deleteApiKey = async (keyId: string) => {
    if (showDeleteDialog.value) {
        return;
    }

    deleteKeyId.value = keyId;
    showDeleteDialog.value = true;

    // const { error } = await auth.apiKey.delete({ keyId });

    // if (error != null) {
    //     quasar.notify({
    //         type:    'negative',
    //         message: error.message,
    //     });

    //     return;
    // }

    // quasar.notify({
    //     type:    'positive',
    //     message: i18n.t('setting.api-key.deleted'),
    // });

    // refreshApiKey();
};

const deleteKeyName = computed(() => {
    const theApiKey = apiKey.value.find(k => k.id === deleteKeyId.value);

    return theApiKey?.name ?? '';
});

const validateDeleteKey = (value: string) => {
    if (deleteKeyId.value === '') {
        return false;
    }

    return deleteKeyName.value === value;
};

const deleteApiKeyConfirm = async () => {
    if (deleteKeyId.value === '') {
        return;
    }

    if (!validateDeleteKey(deleteKeyRepeat.value)) {
        return;
    }

    const { error } = await auth.apiKey.delete({ keyId: deleteKeyId.value });

    if (error != null) {
        quasar.notify({
            type:    'negative',
            message: error.message,
        });

        return;
    }

    quasar.notify({
        type:    'positive',
        message: i18n.t('setting.api-key.deleted'),
    });

    refreshApiKey();
    cleanDeleteDialog();
};

const cleanDeleteDialog = () => {
    deleteKeyId.value = '';
    deleteKeyRepeat.value = '';
    showDeleteDialog.value = false;
};

</script>

<style lang="sass" scoped>
.code
    color: #777
    width: 40px
</style>

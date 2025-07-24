<template>
    <div class="q-pa-md">
        <q-table
            :rows="users"
            :columns="columns"
            row-key="id"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { useI18n } from 'vue-i18n';

import { QTableColumn } from 'quasar';

import { auth } from '@/auth';
import { trpc } from 'src/trpc';

const i18n = useI18n();

const listUsers = async () => {
    const data = await auth.admin.listUsers();

    console.log(data.data.users);

    return data.data.users ?? [];
};

type User = Awaited<ReturnType<typeof listUsers>>[0];

const users = ref<User[]>([]);

const loadUsers = async () => { users.value = await listUsers(); };

onMounted(loadUsers);

const columns = computed(() => [
    {
        name:     'name',
        label:    i18n.t('user.username'),
        align:    'center',
        field:    'name',
        sortable: true,
    },
    {
        name:     'email',
        label:    i18n.t('user.email'),
        align:    'center',
        field:    'email',
        sortable: true,
    },
    {
        name:     'role',
        label:    i18n.t('user.roles'),
        align:    'center',
        field:    'role',
        format:   val => val.split(',').map((r: string) => i18n.t(`user.role.${r}`)),
        sortable: true,
    },
    {
        name:     'createdAt',
        label:    i18n.t('user.createdAt'),
        align:    'center',
        field:    'createdAt',
        sortable: true,
    },
] satisfies QTableColumn[]);

trpc;

</script>

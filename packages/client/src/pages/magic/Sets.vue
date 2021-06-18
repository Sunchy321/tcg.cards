<template>
    <q-page class="q-pa-md">
        <div class="sets">
            <div
                v-for="{ setId, localization, setType, parent } in profileList" :key="setId"
                class="set flex items-center"
                :class="{ 'is-primary': setType === 'core' || setType === 'expansion' }"
            >
                <div v-if="parent != null" style="width: 16px" />
                <span class="name q-mr-sm">{{ nameOf(localization) ?? setId }}</span>
                <span class="id code q-mr-sm">{{ setId }}</span>
                <img v-if="iconUrl(setId, setType, parent) != null" class="icon" :src="iconUrl(setId, setType, parent)">
                <span class="col-grow" />
                <q-btn
                    type="a"
                    target="_blank"
                    :to="{ name: 'magic/set', params: { id: setId }}"
                    icon="mdi-link"
                    flat dense round
                />
            </div>
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.code
    color: #555

.set
    padding: 4px 8px

    &:first-child
        border: 1px black solid
        border-top-left-radius: 8px
        border-top-right-radius: 8px

    &:not(:first-child)
        border-left: 1px black solid
        border-right: 1px black solid
        border-bottom: 1px black solid

    &:last-child
        border-bottom-left-radius: 8px
        border-bottom-right-radius: 8px

    &.is-primary
        color: $primary

.icon
    height: 1em

</style>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import { useRouter } from 'vue-router';
import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import { apiGet, imageBase } from 'boot/backend';

import { SetProfile, SetLocalization, getProfile } from 'src/common/magic/set';

export default defineComponent({
    setup() {
        const router = useRouter();
        const store = useStore();
        const i18n = useI18n();

        pageSetup({
            title: () => i18n.t('magic.ui.set.$self'),
        });

        const sets = ref<string[]>([]);
        const profiles = ref<Record<string, SetProfile>>({});

        const indepSets = computed(() => {
            if (Object.keys(profiles.value).length === 0) {
                return [];
            }

            return sets.value.filter(s => profiles.value[s] != null && profiles.value[s].parent == null);
        });

        const profileList = computed(() => {
            const list: SetProfile[] = [];

            const sortedIndepSets = indepSets.value.slice().sort((a, b) => {
                const pa = profiles.value[a];
                const pb = profiles.value[b];

                const ra = pa.releaseDate;
                const rb = pb.releaseDate;

                return ra == null
                    ? (rb == null ? 0 : -1)
                    : rb == null
                        ? 1
                        : ra < rb
                            ? 1
                            : ra > rb
                                ? -1
                                : 0;
            });

            for (const s of sortedIndepSets) {
                const profile = profiles.value[s];

                list.push(profile);

                const children = sets.value.filter(so => profiles.value[so]?.parent === s);

                for (const c of children) {
                    const profile = profiles.value[c];

                    list.push(profile);
                }
            }

            return list;
        });

        const loadData = async () => {
            const { data } = await apiGet<string[]>('/magic/set');

            sets.value = data;
        };

        const loadProfile = async(sets: string[]) => {
            const locals = [], remotes = [];

            for (const s of sets) {
                const { local, remote } = getProfile(s);

                locals.push(local);
                remotes.push(remote);
            }

            const localResults = await Promise.all(locals);

            const localProfiles: Record<string, SetProfile> = { };

            for (const r of localResults.filter(v => v != null)) {
                localProfiles[r!.setId] = r!;
            }

            profiles.value = localProfiles;

            const remoteResults = await Promise.all(remotes);

            const remoteProfiles: Record<string, SetProfile> = { };

            for (const r of remoteResults.filter(v => v != null)) {
                remoteProfiles[r.setId] = r!;
            }

            profiles.value = remoteProfiles;
        };

        const toDetail = (set: string) => {
            void router.push({
                name:   'magic/set',
                params: { id: set },
            });
        };

        const nameOf = (localization: Record<string, SetLocalization>) =>
            localization[store.getters['magic/locale']]?.name ??
            localization[store.getters['magic/locales'][0]]?.name;

        const iconUrl = (set: string, setType: string, parent?: string) => {
            if (parent != null && ['promo', 'token', 'memorabilia', 'funny'].includes(setType)) {
                return undefined;
            }

            return `http://${imageBase}/magic/set/icon?auto-adjust&set=${set}&rarity=default`;
        };

        watch(sets, loadProfile);

        onMounted(loadData);

        return {
            profileList,

            toDetail,
            nameOf,
            iconUrl,
        };
    },
});
</script>

<template>
    <q-page class="q-pa-md">
        <div class="sets">
            <div
                v-for="{ setId, localization, type, parent, indent } in profileList" :key="setId"
                class="set flex items-center"
                :class="{ 'is-primary': type === 'core' || type === 'expansion' }"
            >
                <div v-if="parent != null" :style="`width: ${16 * indent}px`" />
                <span class="name q-mr-sm">{{ nameOf(localization) ?? setId }}</span>
                <span class="id code q-mr-sm">{{ setId }}</span>
                <img
                    v-if="iconUrl(setId, type, parent) != null"
                    class="icon"
                    :src="iconUrl(setId, type, parent)"
                >
                <span class="col-grow" />
                <q-btn
                    type="a"
                    target="_blank"
                    :to="{ name: 'magic/set', params: { id: setId }}"
                    icon="mdi-menu-right"
                    flat dense round
                />
            </div>
        </div>
    </q-page>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted,
} from 'vue';

import { useGame } from 'store/games/magic';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import { apiGet, assetBase } from 'boot/server';

import setProfile, { SetProfile, SetLocalization } from 'src/common/magic/set';
import { isEqual, partition } from 'lodash';

export default defineComponent({
    setup() {
        const game = useGame();
        const i18n = useI18n();

        pageSetup({
            title: () => i18n.t('magic.set.$self'),
        });

        const sets = ref<string[]>([]);
        const profiles = ref<Record<string, SetProfile>>({});

        const profileList = computed(() => {
            // Make a set list which parent occur before child.
            let profilesDump = Object.values(profiles.value);

            const profilesOrdered: SetProfile[] = [];

            while (profilesDump.length > 0) {
                const [profilesToInsert, profilesRest] = partition(profilesDump, p => {
                    if (p.parent == null) {
                        return true;
                    }

                    const parent = profilesOrdered.find(po => po.setId === p.parent);

                    return parent != null;
                });

                profilesOrdered.push(...profilesToInsert);
                profilesDump = profilesRest;
            }

            // Make a set map.
            type SetMap = { profile: SetProfile, children?: SetMap[] };

            const setMap: SetMap[] = [];

            function insertSet(map: SetMap[], profile: SetProfile) {
                if (profile.parent == null) {
                    map.push({ profile });
                    return true;
                }

                for (const set of map) {
                    if (profile.parent === set.profile.setId) {
                        if (set.children == null) {
                            set.children = [];
                        }

                        set.children.push({ profile });

                        return true;
                    }
                }

                for (const set of map) {
                    if (set.children != null) {
                        if (insertSet(set.children, profile)) {
                            return true;
                        }
                    }
                }

                return false;
            }

            for (const profile of profilesOrdered) {
                if (!insertSet(setMap, profile)) {
                    console.log(
                        profile.setId,
                        profilesDump.findIndex(v => v.setId === profile.setId),
                        profile.parent,
                        profilesDump.findIndex(v => v.setId === profile.parent),
                    );
                }
            }

            // Sort set map with release date.
            function sortMap(map: SetMap[]) {
                for (const set of map) {
                    if (set.children != null) {
                        sortMap(set.children);
                    }
                }

                map.sort((a, b) => {
                    const ra = a.profile.releaseDate;
                    const rb = b.profile.releaseDate;

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
            }

            sortMap(setMap);

            // Flatten map
            const list: (SetProfile & { indent: number })[] = [];

            function flatten(map: SetMap[], indent = 0) {
                for (const set of map) {
                    list.push({ ...set.profile, indent });

                    if (set.children != null) {
                        flatten(set.children, indent + 1);
                    }
                }
            }

            flatten(setMap);

            return list;
        });

        const loadData = async () => {
            const { data } = await apiGet<string[]>('/magic/set');

            sets.value = data;
        };

        const loadProfile = async (setList: string[]) => {
            profiles.value = {};

            const profileMap: Record<string, SetProfile> = { };

            for (const s of setList) {
                setProfile.get(s, v => {
                    if (!isEqual(v, profileMap[s])) {
                        profileMap[s] = v;

                        if (isEqual(setList.sort(), Object.keys(profileMap).sort())) {
                            profiles.value = profileMap;
                        }
                    }
                });
            }
        };

        const nameOf = (localization: Record<string, SetLocalization>) => localization[game.locale]?.name
          ?? localization[game.locales[0]]?.name;

        const iconUrl = (set: string, type: string, parent?: string) => {
            if (parent != null && ['promo', 'token', 'memorabilia', 'funny'].includes(type)) {
                return undefined;
            }

            return `${assetBase}/magic/set/icon/${set}/default.svg`;
        };

        watch(sets, loadProfile);

        onMounted(loadData);

        return {
            profileList,

            nameOf,
            iconUrl,
        };
    },
});
</script>

<style lang="sass" scoped>
.code
    color: #777

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

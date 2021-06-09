<template>
    <q-page>
        <q-img
            v-for="url in urls"
            :key="url"
            class="image"
            :src="url"
            :ratio="745/1040"
            native-context-menu
        >
            <template #error>
                <div class="card-not-found">
                    <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                </div>
            </template>
        </q-img>
    </q-page>
</template>

<style lang="sass" scoped>
.image
    width: calc(100% / 8)
</style>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';

import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import { imageBase, apiGet } from 'boot/backend';

export default defineComponent({
    setup() {
        const store = useStore();
        const i18n = useI18n();

        const { set, lang, type } = pageSetup({
            title: () => i18n.t('magic.iamge-wall'),

            params: {
                set: {
                    type:     'string',
                    bind:     'query',
                    readonly: true,
                },
                lang: {
                    type:     'string',
                    bind:     'query',
                    readonly: true,
                    default:  () => store.getters['magic/locale'],
                },
                type: {
                    type:     'enum',
                    bind:     'query',
                    values:   ['png'],
                    readonly: true,
                },
            },
        });

        const data = ref<string[]>([]);

        const urls = computed(() => {
            return data.value.map(name => {
                const [number, part] = name.split('-');

                if (part != null) {
                    return `http://${imageBase}/magic/card?lang=${lang.value}&set=${set.value}&number=${number}&part=${part}`;
                } else {
                    return `http://${imageBase}/magic/card?lang=${lang.value}&set=${set.value}&number=${number}`;
                }
            });
        });

        const loadData = async () => {
            const { data: result } = await apiGet<string[]>('/magic/set/image-all', {
                id:   set.value,
                lang: lang.value,
                type: type.value,
            });

            data.value = result;
        };

        onMounted(loadData);

        return { urls };
    },
});
</script>

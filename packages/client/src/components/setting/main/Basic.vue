<template>
    <article>
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
    </article>
</template>

<style lang="sass" scoped>
.code
    color: #777
    width: 40px
</style>

<script lang="ts">
import { defineComponent, computed } from 'vue';

import { useCore } from 'store/core';
import { useI18n } from 'vue-i18n';

export default defineComponent({
    setup() {
        const core = useCore();
        const i18n = useI18n();

        const locale = computed({
            get() { return core.locale; },
            set(newValue: string) { core.locale = newValue; },
        });

        const locales = computed(() => core.locales);

        const localeOptions = computed(() => core.locales.map(l => ({
            value: l,
            label: i18n.t('lang.$self', '', { locale: l }),
        })));

        return { locale, locales, localeOptions };
    },

});
</script>

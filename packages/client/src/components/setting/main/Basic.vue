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
                <template v-slot:option="scope">
                    <q-item
                        v-bind="scope.itemProps"
                        v-on="scope.itemEvents"
                    >
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

<style lang="stylus" scoped>
.code
    color #777
    width 40px
</style>

<script>
export default {
    name: 'Basic',

    computed: {
        locale: {
            get() {
                return this.$store.getters.locale;
            },
            set(newValue) {
                this.$store.commit('locale', newValue);
            },
        },

        locales() {
            return this.$store.getters.locales;
        },

        localeOptions() {
            return this.locales.map(l => ({
                value: l,
                label: this.$t('lang.$self', l),
            }));
        },
    },
};
</script>

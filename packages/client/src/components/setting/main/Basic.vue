<template>
    <article>
        <div class="row items-center">
            {{ $t('setting.lang') }}
            <q-select
                v-model="localeApp"
                class="q-ml-sm"
                style="width: 150px"
                dense outlined
                emit-value map-options
                :options="localeAppOptions"
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
        localeApp: {
            get() {
                return this.$store.getters['locale/app'];
            },
            set(newValue) {
                this.$store.commit('locale/app', newValue);
            },
        },

        localesApp() {
            return this.$store.getters['locale/appValues'];
        },

        localeAppOptions() {
            return this.localesApp.map(l => ({
                value: l,
                label: this.$t('lang.$self', l),
            }));
        },
    },
};
</script>

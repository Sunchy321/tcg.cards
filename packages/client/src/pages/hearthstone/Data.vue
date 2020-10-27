<template>
    <q-page class="q-pa-md">
        <div class="q-mb-lg">
            <q-btn
                class="q-mr-md"
                flat
                dense
                :icon="gettingData ? 'mdi-autorenew mdi-spin' : 'mdi-autorenew'"
                :label="$t('hearthstone.hsdata.get-data')"
                @click="getData"
            />

            <q-btn
                flat
                dense
                :icon="loadingData ? 'mdi-autorenew mdi-spin' : 'mdi-autorenew'"
                :label="$t('hearthstone.hsdata.load-data')"
                @click="loadData"
            />
        </div>
        <div class="row">
            <div
                v-for="p in patches"
                :key="p.version"
                class="patch-item col-2 flex items-center"
            >
                <q-icon
                    :class="p.isUpdated ? 'color-positive' : 'color-negative'"
                    :name="p.isUpdated ? 'mdi-check' : 'mdi-close'"
                />
                {{ p.version }}
                <q-btn
                    flat
                    dense
                    :icon="
                        loadingPatch === p.version
                            ? 'mdi-autorenew mdi-spin'
                            : 'mdi-autorenew'
                    "
                    @click="loadPatch(p)"
                />
            </div>
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>
.patch-item
    font-size 120%
</style>

<script>
export default {
    name: 'Hsdata',

    data: () => ({
        gettingData:  false,
        loadingData:  false,
        loadingPatch: null,

        hasData: false,
        status:  null,
        patches: [],
    }),

    mounted() {
        this.loadInfo();
    },

    methods: {
        async loadInfo() {
            ({
                data: { hasData: this.hasData },
            } = await this.apiGet('/hearthstone/hsdata'));

            if (this.hasData) {
                ({ data: this.patches } = await this.apiGet(
                    '/hearthstone/patch',
                ));
            }
        },

        async getData() {
            this.gettingData = true;

            await this.apiPost('/hearthstone/hsdata/get-data');
            await this.apiPost('/hearthstone/hsdata/load-data');

            this.gettingData = false;
            this.loadInfo();
        },

        async loadData() {
            this.loadingData = true;

            await this.apiPost('/hearthstone/hsdata/load-data');

            this.loadingData = false;
            this.loadInfo();
        },

        async loadPatch(patch) {
            if (this.loadingPatch != null) {
                return;
            }

            this.loadingPatch = patch.version;
            this.$forceUpdate();

            this.api
                .post('/hearthstone/hsdata/load-patch', {
                    version: patch.version,
                })
                .then(({ data }) => {
                    if (data.failure) {
                        console.log(data.failure);
                    } else {
                        patch.isUpdated = true;
                        this.$forceUpdate();
                    }
                })
                .catch(() => {
                    this.loadingPatch = null;
                    this.loadInfo();
                });
        },
    },
};
</script>

<template>
    <div class="q-pa-md">
        <div class="row items-center q-mb-md q-gutter-md">
            <q-select
                v-model="id"
                dense outlined
                use-input hide-selected
                fill-input
                input-debounce="0"
                :options="filteredSet"
                @filter="filterFn"
            />

            <div class="col-grow" />

            <q-btn
                label="Fill link"
                outline
                @click="fillLink"
            />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />
        </div>

        <div>
            <div v-for="l in localization" :key="l.lang" class="row items-center q-gutter-md">
                <div class="code" style="flex-basis: 25px">
                    {{ l.lang }}
                </div>
                <q-checkbox
                    :value="l.isOfficialName"
                    :disable="l.name == null"
                    @input="v => toggleIsWotcName(l.lang, v)"
                />
                <q-input :value="l.name" class="col" dense outlined @input="v => assignName(l.lang, v)" />
                <q-input :value="l.link" class="col" dense outlined @input="v => assignLink(l.lang, v)" />
                <q-btn
                    type="a" :href="l.link" target="_blank"
                    :disable="l.link == null"
                    icon="mdi-link"
                    flat round dense
                />
            </div>
        </div>
    </div>
</template>

<script>
const linkMap = {
    en:  'en',
    de:  'de',
    es:  'es',
    fr:  'fr',
    it:  'it',
    ja:  'ja',
    ko:  'ko',
    pt:  'pt-br',
    ru:  'ru',
    zhs: 'zh-hans',
    zht: 'zh-hant',
};

export default {
    data: () => ({
        set:         [],
        data:        null,
        filteredSet: [],
    }),

    computed: {
        id: {
            get() {
                return this.$route.query.id ?? this.set[0];
            },
            set(newValue) {
                this.$router.push({
                    query: {
                        ...this.$route.query,
                        id: newValue,
                    },
                });
            },
        },

        localization() {
            return this.$store.getters['magic/locales'].map(l => this.data?.localization?.find(v => v.lang === l) ?? {
                lang: l,
                name: null,
                link: null,
            });
        },

        localizationColumns() {
            return [
                { name: 'lang', label: 'Lang', field: 'lang' },
                { name: 'name', label: 'Name', field: 'name' },
                { name: 'link', label: 'Link', field: 'link' },
            ];
        },
    },

    watch: {
        set() {
            this.filteredSet = this.set;
        },

        id() {
            this.loadData();
        },
    },

    mounted() {
        this.loadList();
    },

    methods: {
        async loadList() {
            const { data: set } = await this.apiGet('/magic/set');

            this.set = set;

            if (this.data == null) {
                this.loadData();
            }
        },

        async loadData() {
            if (this.data != null) {
                this.save();
            }

            const { data } = await this.apiGet('/magic/set', { id: this.id });

            this.data = data;
        },

        filterFn(val, update) {
            if (val === '') {
                update(() => {
                    this.filteredSet = this.set;
                });
            } else {
                update(() => {
                    this.filteredSet = this.set.filter(s => s.includes(val));
                });
            }
        },

        assignName(lang, name) {
            if (this.data == null) {
                return;
            }

            const loc = this.data.localization.find(l => l.lang === lang);

            if (loc == null) {
                this.data.localization = [...this.data.localization, { lang, name, isOfficialName: true }];
            } else {
                if (loc.name == null) {
                    this.$set(loc, 'isOfficialName', true);
                }

                this.$set(loc, 'name', name);
            }
        },

        assignLink(lang, link) {
            if (this.data == null) {
                return;
            }

            const loc = this.data.localization.find(l => l.lang === lang);

            if (loc == null) {
                this.data.localization = [...this.data.localization, { lang, link }];
            } else {
                this.$set(loc, 'link', link);
            }
        },

        toggleIsWotcName(lang) {
            if (this.data == null) {
                return;
            }

            const loc = this.data.localization.find(l => l.lang === lang);

            if (loc != null) {
                this.$set(loc, 'isOfficialName', !loc.isOfficialName);
            }
        },

        fillLink() {
            if (this.data == null) {
                return;
            }

            const loc = this.data.localization.find(l => l.lang === 'en');

            if (loc != null && loc.link != null) {
                for (const l of this.localization) {
                    if (l.link == null || l.link === '') {
                        this.assignLink(l.lang, loc.link.replace('/en/', '/' + linkMap[l.lang] + '/'));
                    }
                }
            }
        },

        prettify() {
            if (this.data == null) {
                return;
            }

            this.data.localization = this.data.localization.filter(l =>
                (l.name != null && l.name !== '') || (l.link != null && l.link !== ''),
            );

            for (const l of this.data.localization) {
                if (l.name === '') {
                    delete l.name;
                    delete l.isOfficialName;
                }

                if (l.link === '') {
                    delete l.link;
                }
            }
        },

        async save() {
            if (this.data != null) {
                this.prettify();

                await this.apiPost('/magic/set/save', { data: this.data });
            }
        },
    },
};
</script>

<style>

</style>

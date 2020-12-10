<template>
    <q-page>
        <div class="row items-center q-gutter-md q-pa-md">
            <div class="col-grow" />
            <q-select v-model="from" dense outlined :options="date" />
            <q-btn icon="mdi-vector-difference" flat dense round @click="loadData" />
            <q-select v-model="to" dense outlined :options="date" />
            <div class="col-grow" />
        </div>

        <q-splitter v-if="intro.length > 0" v-model="splitter" emit-immediately>
            <template v-slot:before class="q-pa-sm">
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.intro') }}
                    </div>
                    <magic-text
                        v-for="(d, i) in intro.filter(d => d.type !== 'add')" :key="i"
                        :class="`depth-2 text-${d.type}`"
                        :value="d.value"
                    />
                </div>
            </template>
            <template v-slot:after class="q-pa-sm">
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.intro') }}
                    </div>
                    <magic-text
                        v-for="(d, i) in intro.filter(d => d.type !== 'remove')" :key="i"
                        :class="`depth-2 text-${d.type}`"
                        :value="d.value"
                    />
                </div>
            </template>
        </q-splitter>

        <q-splitter v-for="c in contents" :key="c.id" v-model="splitter" emit-immediately>
            <template v-slot:before class="q-pa-sm">
                <div
                    v-if="c.type !== 'add'"
                    class="q-pa-sm"
                    :class="`depth-${c.depth[0]}`"
                >
                    <magic-text :class="c.type ? `text-${c.type}` : ''" :value="c.index[0] + ' '" />

                    <magic-text
                        v-for="(d, i) in (c.text || []).filter(d => d.type !== 'add')" :key="i"
                        :class="`text-${d.type}`"
                        :value="d.value"
                    />

                    <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                        <q-icon name="mdi-chevron-right" class="example-icon" />
                        <magic-text
                            v-for="(d, j) in e.filter(d => d.type !== 'add')" :key="j"
                            :class="`text-${d.type}`"
                            :value="d.value"
                        />
                    </div>
                </div>
            </template>
            <template v-slot:after class="q-pa-sm">
                <div
                    v-if="c.type !== 'remove'"
                    class="q-pa-sm"
                    :class="`depth-${c.depth[1]}`"
                >
                    <magic-text :class="c.type ? `text-${c.type}` : ''" :value="c.index[1] + ' '" />

                    <magic-text
                        v-for="(d, i) in (c.text || []).filter(d => d.type !== 'remove')" :key="i"
                        :class="`text-${d.type}`"
                        :value="d.value"
                    />

                    <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                        <q-icon name="mdi-chevron-right" class="example-icon" />
                        <magic-text
                            v-for="(d, j) in e.filter(d => d.type !== 'remove')" :key="j"
                            :class="`text-${d.type}`"
                            :value="d.value"
                        />
                    </div>
                </div>
            </template>
        </q-splitter>

        <q-splitter v-if="glossary.length > 0" v-model="splitter" emit-immediately>
            <template v-slot:before class="q-pa-sm">
                <div class="q-pa-sm depth-0">
                    {{ $t('magic.cr.glossary') }}
                </div>
            </template>
            <template v-slot:after class="q-pa-sm">
                <div class="q-pa-sm depth-0">
                    {{ $t('magic.cr.glossary') }}
                </div>
            </template>
        </q-splitter>

        <q-splitter v-for="g in glossary" :key="'g:' + g.ids.join(' ')" v-model="splitter" emit-immediately>
            <template v-slot:before class="q-pa-sm">
                <div
                    v-if="g.type !== 'add'"
                    class="q-pa-sm depth-2"
                >
                    <magic-text :class="g.type ? `text-${g.type}` : ''" :value="g.words.join(', ')" />

                    <br>

                    <magic-text
                        v-for="(d, i) in (g.text || []).filter(d => d.type !== 'add')" :key="i"
                        :class="`text-${d.type}`"
                        :value="d.value"
                    />
                </div>
            </template>
            <template v-slot:after class="q-pa-sm">
                <div
                    v-if="g.type !== 'remove'"
                    class="q-pa-sm depth-2"
                >
                    <magic-text :class="g.type ? `text-${g.type}` : ''" :value="g.words.join(', ')" />

                    <br>

                    <magic-text
                        v-for="(d, i) in (g.text || []).filter(d => d.type !== 'remove')" :key="i"
                        :class="`text-${d.type}`"
                        :value="d.value"
                    />
                </div>
            </template>
        </q-splitter>

        <q-splitter v-if="credits.length > 0" :value="splitter" emit-immediately>
            <template v-slot:before>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.credits') }}
                    </div>
                    <magic-text
                        v-for="(d, i) in credits.filter(d => d.type !== 'add')" :key="i"
                        :class="`depth-2 text-${d.type}`"
                        :value="d.value"
                    />
                </div>
            </template>
            <template v-slot:after>
                <div class="q-pa-sm">
                    <div class="depth-0">
                        {{ $t('magic.cr.credits') }}
                    </div>
                    <magic-text
                        v-for="(d, i) in credits.filter(d => d.type !== 'remove')" :key="i"
                        :class="`depth-2 text-${d.type}`"
                        :value="d.value"
                    />
                </div>
            </template>
        </q-splitter>
    </q-page>
</template>

<style lang="stylus" scoped>

* >>> .text-add
    background-color $green-2

* >>> .text-remove
    background-color $red-2

* >>> .text-move
    background-color $amber-2

.depth-0
    font-size 200%
    margin-bottom 30px

.depth-1
    font-size 150%
    margin-bottom 20px

.depth-2
    margin-bottom 15px

.depth-3
    margin-bottom 15px

* >>> .example-icon
    margin-right 10px
    color $primary

</style>

<script>
import MagicText from 'components/magic/Text';

export default {
    name: 'CRDiff',

    components: { MagicText },

    data: () => ({
        date:     [],
        data:     null,
        splitter: 50,
    }),

    computed: {
        from: {
            get() { return this.$route.query.from ?? this.date.slice(-2)[0]; },
            set(newValue) {
                if (this.date.includes(newValue) && newValue !== this.from) {
                    this.$router.push({ query: { ...this.$route.query, from: newValue } });
                    this.loadData();
                }
            },
        },
        to: {
            get() { return this.$route.query.to ?? this.date.slice(-1)[0]; },
            set(newValue) {
                if (this.date.includes(newValue) && newValue !== this.to) {
                    this.$router.push({ query: { ...this.$route.query, to: newValue } });
                    this.loadData();
                }
            },
        },

        intro() { return this.data?.intro ?? []; },
        contents() { return this.data?.contents ?? []; },
        glossary() { return this.data?.glossary ?? []; },
        credits() { return this.data?.credits ?? []; },
    },

    async mounted() {
        await this.loadList();
        await this.loadData();
    },

    methods: {
        async loadList() {
            const { data } = await this.apiGet('/magic/cr/list');

            this.date = data;
        },

        async loadData() {
            const { data } = await this.apiGet('/magic/cr/diff', { from: this.from, to: this.to });

            this.data = data;
        },
    },
};
</script>

<style>

</style>

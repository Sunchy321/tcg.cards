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
            <template v-slot:error>
                <div class="card-not-found">
                    <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                </div>
            </template>
        </q-img>
    </q-page>
</template>

<style lang="stylus" scoped>
.image
    width calc(100% / 8)
</style>

<script>
import page from 'src/mixins/page';

import { imageBase } from 'src/boot/backend';

export default {
    name: 'ImageWall',

    mixins: [page],

    data: () => ({
        data: [],
    }),

    computed: {
        title() { return this.$t('magic.image-wall'); },

        set() { return this.$route.query.set; },
        lang() { return this.$route.query.lang || this.$store.getters['magic/locale']; },
        type() { return this.$route.query.type || 'png'; },

        urls() {
            return this.data.map(name => {
                const [number, part] = name.split('-');

                if (part != null) {
                    return `http://${imageBase}/magic/card?lang=${this.lang}&set=${this.set}&number=${number}&part=${part}`; ;
                } else {
                    return `http://${imageBase}/magic/card?lang=${this.lang}&set=${this.set}&number=${number}`;
                }
            });
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data } = await this.apiGet('/magic/card/image-all', {
                set: this.set, lang: this.lang, type: this.type,
            });

            this.data = data;
        },
    },
};
</script>

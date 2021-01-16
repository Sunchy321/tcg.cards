<template>
    <div>
        123
    </div>
</template>

<script>
import magic from 'src/mixins/magic';

export default {
    name: 'Format',

    mixins: [magic],

    data: () => ({
        data: null,
    }),

    computed: {
        id() {
            return this.$route.params.id;
        },
    },

    watch: {
        param() {
            if (this.param !== this.id && this.param != null) {
                this.$router.push({ name: 'magic/format', params: { id: this.param } });
            }
        },

        id: {
            immediate: true,
            handler() {
                this.loadData();
            },
        },
    },

    mounted() {
        this.loadList();
    },

    methods: {
        async loadList() {
            const { data } = await this.apiGet('/magic/format');

            this.paramOptions = { options: data, initial: this.id };
        },

        async loadData() {
            const { data } = await this.apiGet('/magic/format', { id: this.selection });

            this.data = data;
        },

        'param/label'(v) {
            return this.$t('magic.format.' + v);
        },
    },
};
</script>

<template>
    <div class="q-pa-md">
        <template v-if="sets.length > 0">
            <div class="title q-mb-md">
                {{ $t('magic.ui.format.set') }}
            </div>

            <div class="row q-gutter-sm">
                <div v-for="s in sets" :key="s" class="set">
                    {{ s }}
                </div>
            </div>
        </template>

        <template v-if="banlist.length > 0">
            <div class="title q-my-md">
                {{ $t('magic.ui.format.banlist') }}
            </div>

            <div class="row">
                <div v-for="b in banlist" :key="b.card" class="banlist row items-center q-gutter-sm">
                    <q-icon
                        :name="statusIcon(b.status, b.card)"
                        :class="'magic-banlist-status-' + b.status"
                    />
                    <div class="date">
                        {{ b.date }}
                    </div>
                    <div>{{ b.card }}</div>
                </div>
            </div>
        </template>
    </div>
</template>

<style lang="stylus" scoped>
.title
    font-size 24px

.set
    border black 1px solid
    border-radius 5px
    padding 2px

.banlist
    flex-basis 300px
    flex-shrink 0
    flex-grow 1

.date
    color grey
</style>

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

        sets() {
            return this.data?.sets ?? [];
        },

        banlist() {
            return this.data?.banlist ?? [];
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
            const { data } = await this.apiGet('/magic/format/' + this.id);

            this.data = data;
        },

        'param/label'(v) {
            return this.$t('magic.format.' + v);
        },

        statusIcon(status, card) {
            switch (status) {
            case 'banned':
                return 'mdi-close-circle-outline';
            case 'suspended':
                return 'mdi-help-circle-outline';
            case 'banned_as_commander':
                return 'mdi-progress-close';
            case 'restricted':
                return 'mdi-alert-circle-outline';
            case 'legal':
                return 'mdi-check-circle-outline';
            case 'unavailable':
                return 'mdi-cancel';
            case undefined:
                if (card.startsWith('#{clone:')) {
                    return 'mdi-content-copy';
                } else {
                    return 'mdi-help-circle-outline';
                }
            }
        },
    },
};
</script>

<template>
    <q-page>
        <div class="q-pa-md">
            <q-btn class="q-mr-md" icon="mdi-refresh" round dense @click="loadChanges" />
            <q-btn class="q-mr-md" icon="mdi-plus" round dense @click="addItem" />
            <btn-select v-model="filter" :options="filterList" />
        </div>
        <change-item
            v-for="(c, i) in change" :key="c._id"
            :value="c"
            @input="v => updateItem(i, v)"
            @reload="loadChanges"
        />
        <q-page-scroller position="bottom-right" :offset="[20, 20]">
            <q-btn fab-mini icon="mdi-arrow-up" color="primary" />
        </q-page-scroller>
    </q-page>
</template>

<script>
import BtnSelect from 'components/BtnSelect';
import ChangeItem from './format-change/ChangeItem';

export default {
    name: 'FormatChange',

    components: { BtnSelect, ChangeItem },

    data() {
        return {
            change: [],
            filter: null
        };
    },

    watch: {
        $route: {
            immediate: true,
            handler() {
                this.loadChanges();
            }
        },

        filter() {
            this.loadChanges();
        }
    },

    computed: {
        filterList() {
            return [
                { value: null, icon: 'mdi-check-all' },
                { value: 'wotc', label: this.$t('magic.format-change.source/option.wotc') },
                { value: 'mtgcommander', label: this.$t('magic.format-change.source/option.mtgcommander') },
                { value: 'duelcommander', label: this.$t('magic.format-change.source/option.duelcommander') },
            ];
        }
    },

    methods: {
        async loadChanges() {
            const { data } = await this.$axios.get('/control/magic/raw-format-change', {
                params: {
                    filter: this.filter
                }
            });

            this.change = data;
        },

        addItem() {
            if (this.change.some(c => c._id === '')) {
                return;
            }

            switch (this.filter) {
            case 'wotc':
                this.change.unshift({ _id: '', type: 'banlist-change', source: 'wotc' });
                break;
            case 'mtgcommander':
                this.change.unshift({ _id: '', type: 'banlist-change', source: 'mtgcommander' });
                break;
            case 'duelcommander':
                this.change.unshift({ _id: '', type: 'banlist-change', source: 'duelcommander' });
                break;
            default:
                this.change.unshift({ _id: '' });
            }
        },

        updateItem(i, v) {
            this.change[i] = v;
            this.$forceUpdate();
        }
    }
};
</script>

<style>

</style>

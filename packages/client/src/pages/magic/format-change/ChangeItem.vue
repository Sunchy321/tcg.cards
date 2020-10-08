<template>
    <q-card class="main q-pa-md q-ma-md">
        <template v-if="editing">
            <div class="row">
                <q-select
                    v-model="type"
                    :options="typeList"
                    :label="$t('magic.format-change.type')"
                    dense emit-value map-options
                />
                <q-select
                    v-model="source"
                    :options="sourceList"
                    :label="$t('magic.format-change.source')"
                    dense emit-value map-options
                />
                <q-select
                    v-model="category"
                    :options="categoryList"
                    :label="$t('magic.format-change.category')"
                    dense emit-value map-options clearable
                />
                <q-input class="col" v-model="url" dense @change="importURL" >
                    <template #append>
                        <q-btn icon="mdi-file-document-box-search" flat round dense @click="importURL" />
                    </template>
                </q-input>
                <btn ref="upload" icon="mdi-upload" size="sm" round dense @click="upload" />
                <q-btn icon="mdi-pencil" size="sm" round dense @click="toggleEditing"/>
            </div>
            <div class="row">
                <q-icon name="mdi-calendar" />
                <q-input v-model="date" dense>
                    <template #append>
                        <q-icon name="mdi-calendar" class="cursor-pointer">
                            <q-popup-proxy ref="dateProxy">
                                <q-date
                                    v-model="date"
                                    mask="YYYY-MM-DD"
                                    @input="() => $refs.dateProxy.hide()"
                                />
                            </q-popup-proxy>
                        </q-icon>
                    </template>
                </q-input>
                <q-icon name="mdi-arrow-right-circle" />
                <q-input v-model="nextDate" dense clearable>
                    <template #append>
                        <q-icon name="mdi-calendar" class="cursor-pointer">
                            <q-popup-proxy ref="nextDateProxy">
                                <q-date
                                    v-model="nextDate"
                                    mask="YYYY-MM-DD"
                                    @input="() => $refs.nextDateProxy.hide()"
                                />
                            </q-popup-proxy>
                        </q-icon>
                    </template>
                </q-input>
                <q-icon name="mdi-cards-outline" />
                <q-input v-model="eDateTable" dense clearable>
                    <template #append>
                        <q-icon name="mdi-calendar" class="cursor-pointer">
                            <q-popup-proxy ref="tabletopDateProxy">
                                <q-date
                                    v-model="date"
                                    mask="YYYY-MM-DD"
                                    @input="() => $refs.tabletopDateProxy.hide()"
                                />
                            </q-popup-proxy>
                        </q-icon>
                    </template>
                </q-input>
                <q-icon name="mdi-alpha-o-circle-outline" />
                <q-input v-model="eDateOnline" dense clearable>
                    <template #append>
                        <q-icon name="mdi-calendar" class="cursor-pointer">
                            <q-popup-proxy ref="onlineDateProxy">
                                <q-date
                                    v-model="date"
                                    mask="YYYY-MM-DD"
                                    @input="() => $refs.onlineDateProxy.hide()"
                                />
                            </q-popup-proxy>
                        </q-icon>
                    </template>
                </q-input>
                <q-icon name="mdi-alpha-a-circle-outline" />
                <q-input v-model="eDateArena" dense clearable>
                    <template #append>
                        <q-icon name="mdi-calendar" class="cursor-pointer">
                            <q-popup-proxy ref="arenaDateProxy">
                                <q-date
                                    v-model="date"
                                    mask="YYYY-MM-DD"
                                    @input="() => $refs.arenaDateProxy.hide()"
                                />
                            </q-popup-proxy>
                        </q-icon>
                    </template>
                </q-input>
            </div>
            <div class="row">
                <q-icon name="mdi-link" />
                <q-btn size="sm" flat dense icon="mdi-plus" @click="addLink" />
            </div>
            <div class="row" v-for="(l, i) in link" :key="'link-' + i">
                <q-input class="col" :value="l" @input="v => modifyLink(i, v)" dense />
                <q-btn size="sm" flat dense icon="mdi-minus" @click="removeLink(i)" />
            </div>
            <div class="row">
                <q-icon name="mdi-card-bulleted-outline" />
                <q-btn size="sm" flat dense icon="mdi-plus" @click="addChange" />
            </div>
            <div class="row" v-for="(c, i) in changes" :key="'change-' + i">
                <q-input class="col" :value="c.card" @input="v => modifyChangeCard(i, v)" dense />
                <q-select
                    :value="c.format"
                    @input="v => modifyChangeFormat(i, v)"
                    :options="formatList"
                    :label="$t('magic.format-change.format')"
                    dense emit-value map-options
                />
                <btn-select
                    :value="c.status"
                    @input="v => modifyChangeStatus(i, v)"
                    :options="statusList"
                    flat dense
                />

                <q-btn size="sm" flat dense icon="mdi-arrow-up" @click="moveChangeUp(i)" :disable="i === 0" />
                <q-btn size="sm" flat dense icon="mdi-arrow-down" @click="moveChangeDown(i)" :disable="i === changes.length - 1" />
                <q-btn size="sm" flat dense icon="mdi-minus" @click="removeChange(i)" />
            </div>
            <div class="row" v-if="__text != null">
                <div class="full-width" v-for="(t, i) in __text" :key="i">
                    {{ t }}
                </div>
            </div>
        </template>
        <template v-else>
            <div class="row">
                <span v-if="type != null">{{ typeDesc }}</span>
                <span v-if="source != null">{{ sourceDesc }}</span>
                <template v-if="isEmptyId">
                    <q-input class="col" v-model="url" dense @change="importURL" >
                        <template #append>
                            <q-btn icon="mdi-import" flat round dense @click="importURL" />
                        </template>
                    </q-input>
                    <q-btn icon="mdi-upload" size="sm" round dense @click="upload" />
                </template>
                <div v-else class="col" />
                <q-btn icon="mdi-pencil" size="sm" round dense @click="toggleEditing"/>
            </div>
            <div class="row">
                <div v-if="date != null"  class="col-3">
                    <q-icon name="mdi-calendar" />
                    <span class="q-mr-sm">{{ date }}</span>
                </div>
                <div v-if="nextDate != null" class="col-3">
                    <q-icon name="mdi-arrow-right-circle" />
                    <span>{{ nextDate }}</span>
                </div>
            </div>
            <div v-if="effectiveDate != null" class="row">
                <div v-if="eDateTable != null" class="col-3">
                    <q-icon name="mdi-cards-outline" />
                    <span>{{ eDateTable }}</span>
                </div>
                <div v-if="eDateOnline != null" class="col-3">
                    <q-icon name="mdi-alpha-o-circle-outline" />
                    <span>{{ eDateOnline }}</span>
                </div>
                <div v-if="eDateArena != null" class="col-3">
                    <q-icon name="mdi-alpha-a-circle-outline" />
                    <span>{{ eDateArena }}</span>
                </div>
            </div>
            <div class="row" v-for="l in link" :key="l">
                <q-icon name="mdi-link" />
                <a :href="l">{{ l }}</a>
            </div>
            <div class="row">
                <div class="col-3 change" v-for="c in changes" :key="c.card + ':' + c.format">
                    <q-icon
                        :class="'magic-banlist-status-' + c.status"
                        :name="statusIcon(c.status, c.card)"
                    />
                    <span>{{ formatName(c.format) }}</span>
                    <code>{{ c.card }}</code>
                </div>
            </div>
            <div class="row" v-if="__text != null">
                <div class="full-width" v-for="(t, i) in __text" :key="i">
                    {{ t }}
                </div>
            </div>
        </template>
    </q-card>
</template>

<style lang="stylus" scoped>

.main > .row
    align-items center

.main > .row:not(:last-child)
    margin-bottom $space-sm.y

.main > .row > *:not(:last-child)
.main > .row > .col > *:not(:last-child)
.main > .row > .col-3 > *:not(:last-child)
    margin-right $space-sm.x

.col-3.change
    width calc(33.333% - 10px)

</style>

<script>
import Btn from 'components/Btn';
import BtnSelect from 'components/BtnSelect';

import { capitalize, cloneDeep, deburr } from 'lodash';

function toIdentifier(text) {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

export default {
    name: 'ChangeItem',

    props: {
        value: Object
    },

    components: { Btn, BtnSelect },

    data() {
        return {
            editing: false,

            url: ''
        };
    },

    mounted() {
        if (this.isEmptyId) {
            this.editing = true;
        }
    },

    computed: {
        isEmptyId() {
            return this.value._id === '' || this.value._id == null;
        },

        typeList() {
            return ['banlist-change'].map(v => ({
                label: this.$t('magic.format-change.type/option.' + v),
                value: v
            }));
        },

        sourceList() {
            return ['wotc', 'mtgcommander', 'duelcommander'].map(v => ({
                label: this.$t('magic.format-change.source/option.' + v),
                value: v
            }));
        },

        categoryList() {
            return ['pioneer', 'commander1v1'].map(v => ({
                label: this.$t('magic.format-change.category/option.' + v),
                value: v
            }));
        },

        formatList() {
            return [
                'standard',
                'historic',
                'pioneer',
                'modern',
                'extended',
                'legacy',
                'vintage',

                'standard/arena',

                'commander',
                'duelcommander',
                'commander1v1',
                'brawl',

                'pauper',

                'block/ice_age',
                'block/tempest',
                'block/urza',
                'block/masques',
                'block/mirrodin',
            ].map(v => ({
                label: this.formatName(v),
                value: v
            }));
        },

        statusList() {
            return ['legal', 'banned', 'suspended', 'restricted', 'banned_as_commander', 'unavailable'].map(v => ({
                icon:  this.statusIcon(v),
                class: 'magic-banlist-status-' + v,
                value: v
            }));
        },

        type: {
            get() {
                return this.value.type;
            },
            set(newType) {
                const newValue = cloneDeep(this.value);
                newValue.type = newType;
                this.$emit('input', newValue);
            }
        },

        typeDesc() {
            if (this.type) {
                return this.$t('magic.format-change.type/option.' + this.type);
            } else {
                return '<no type>';
            }
        },

        source: {
            get() {
                return this.value.source;
            },
            set(newSource) {
                const newValue = cloneDeep(this.value);
                newValue.source = newSource;
                this.$emit('input', newValue);
            }
        },

        category: {
            get() {
                return this.value.category;
            },
            set(newCategory) {
                const newValue = cloneDeep(this.value);
                newValue.category = newCategory;
                this.$emit('input', newValue);
            }
        },

        sourceDesc() {
            if (this.source) {
                const source = this.$t('magic.format-change.source/option.' + this.source);

                if (this.category != null) {
                    return source + '/' + this.$t('magic.format-change.category/option.' + this.category);
                } else {
                    return source;
                }
            } else {
                return '<no source>';
            }
        },

        date: {
            get() {
                return this.value.date;
            },
            set(newDate) {
                const newValue = cloneDeep(this.value);
                newValue.date = newDate;
                this.$emit('input', newValue);
            }
        },

        nextDate: {
            get() {
                return this.value.nextDate;
            },
            set(newDate) {
                const newValue = cloneDeep(this.value);
                newValue.nextDate = newDate;
                this.$emit('input', newValue);
            }
        },

        effectiveDate() {
            return this.value.effectiveDate;
        },

        eDateTable: {
            get() {
                return this.value.effectiveDate?.tabletop;
            },
            set(newDate) {
                const newValue = cloneDeep(this.value);

                if (newValue.effectiveDate == null) {
                    newValue.effectiveDate = {};
                }

                newValue.effectiveDate.tabletop = newDate;
                this.$emit('input', newValue);
            }
        },

        eDateOnline: {
            get() {
                return this.value.effectiveDate?.online;
            },
            set(newDate) {
                const newValue = cloneDeep(this.value);

                if (newValue.effectiveDate == null) {
                    newValue.effectiveDate = {};
                }

                newValue.effectiveDate.online = newDate;
                this.$emit('input', newValue);
            }
        },

        eDateArena: {
            get() {
                return this.value.effectiveDate?.arena;
            },
            set(newDate) {
                const newValue = cloneDeep(this.value);

                if (newValue.effectiveDate == null) {
                    newValue.effectiveDate = {};
                }

                newValue.effectiveDate.arena = newDate;
                this.$emit('input', newValue);
            }
        },

        link: {
            get() {
                return this.value.link ?? [];
            },
            set(newLink) {
                const newValue = cloneDeep(this.value);
                newValue.link = newLink;
                this.$emit('input', newValue);
            }
        },

        changes: {
            get() {
                return this.value.changes ?? [];
            },
            set(newChanges) {
                const newValue = cloneDeep(this.value);
                newValue.changes = newChanges;
                this.$emit('input', newValue);
            }
        },

        __text() {
            return this.value.__debug?.filter(v => v.type === 'line').map(v => v.text);
        }
    },

    methods: {
        toggleEditing() {
            this.editing = !this.editing;
        },

        async importURL() {
            if (this.url === '') {
                return;
            }

            const { data } = await this.$axios.get('/control/magic/parse-banlist', {
                params: {
                    url: this.url
                }
            });

            this.$emit('input', data);
        },

        async upload() {
            await this.$axios.post('/control/magic/update-format-change', {
                data:    this.value,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            await this.$refs.upload.flicker('positive');

            this.$emit('reload');
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
                } if (card === '#{assign}') {
                    return 'mdi-lock';
                } else {
                    return 'mdi-help-circle-outline';
                }
            }
        },

        formatName(format) {
            if (format === '' || format == null) {
                return '';
            } else if (format.startsWith('block/')) {
                return capitalize(format);
            } else {
                return this.$t('magic.format.' + format);
            }
        },

        addLink() {
            const link = cloneDeep(this.link);
            link.push('');
            this.link = link;
        },

        removeLink(i) {
            const link = cloneDeep(this.link);
            link.splice(i, 1);
            this.link = link;
        },

        modifyLink(i, v) {
            const link = cloneDeep(this.link);
            link[i] = v;
            this.link = link;
        },

        addChange() {
            const changes = cloneDeep(this.changes);

            const c = { };

            if (changes.length !== 0) {
                c.format = changes[changes.length - 1].format;
                c.status = changes[changes.length - 1].status;
            }

            changes.push(c);
            this.changes = changes;
        },

        removeChange(i) {
            const changes = cloneDeep(this.changes);
            changes.splice(i, 1);
            this.changes = changes;
        },

        moveChangeUp(i) {
            if (i !== 0) {
                const changes = cloneDeep(this.changes);

                const prev = changes[i - 1];
                changes[i - 1] = changes[i];
                changes[i] = prev;

                this.changes = changes;
            }
        },

        moveChangeDown(i) {
            if (i !== this.changes.length - 1) {
                const changes = cloneDeep(this.changes);

                const next = changes[i + 1];
                changes[i + 1] = changes[i];
                changes[i] = next;

                this.changes = changes;
            }
        },

        modifyChangeCard(i, v) {
            const changes = cloneDeep(this.changes);

            if (v.startsWith('#')) {
                changes[i].card = v;

                if (v === '#{assign}') {
                    delete changes[i].status;
                }
            } else {
                changes[i].card = toIdentifier(v);
            }

            this.changes = changes;
        },

        modifyChangeFormat(i, v) {
            const changes = cloneDeep(this.changes);
            changes[i].format = v;
            this.changes = changes;
        },

        modifyChangeStatus(i, v) {
            const changes = cloneDeep(this.changes);
            changes[i].status = v;
            this.changes = changes;
        }
    }
};
</script>

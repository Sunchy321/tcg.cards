<template>
    <div class="q-pa-md">
        <table class="tag-list q-ma-md">
            <tr
                v-for="{ number, name, desc, type } in data" :key="number"
                :class="`type-${type}`"
            >
                <td class="tag-number q-pa-md">{{ number }}</td>
                <td class="tag-name q-pa-md">{{ name }}</td>
                <td class="tag-desc q-pa-md">{{ desc }}</td>
            </tr>
        </table>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import mechanics from 'data/hearthstone/tag/map/mechanic.yml';
import relatedEntity from 'data/hearthstone/tag/map/related-entity.yml';
import field from 'data/hearthstone/tag/field.yml';
import locField from 'data/hearthstone/tag/localization-field.yml';

const i18n = useI18n();

pageSetup({
    title: () => i18n.t('hearthstone.ui.misc.tag'),
});

const tagDesc = (tag: string) => {
    if (tag.startsWith('?')) {
        return '';
    }

    const key = `hearthstone.tag.${tag}`;

    if (i18n.te(key)) {
        return i18n.t(key);
    } else {
        return tag;
    }
};

const data = [
    ...Object.entries(mechanics).map(([k, v]) => ({
        number: Number.parseInt(k, 10),
        name:   v,
        desc:   tagDesc(v),
        type:   'mechanic',
    })),

    ...Object.entries(relatedEntity).map(([k, v]) => ({
        number: Number.parseInt(k, 10),
        name:   v,
        desc:   tagDesc(v),
        type:   'related-entity',
    })),

    ...Object.entries(field).map(([k, v]) => {
        const newKey = v.index.replace(/([A-Z])/g, (_, c) => `_${c.toLowerCase()}`).trim();

        return {
            number: Number.parseInt(k, 10),
            name:   newKey,
            desc:   tagDesc(newKey),
            type:   'field',
        };
    }),

    ...Object.entries(locField).map(([k, v]) => {
        const newKey = v.replace(/([A-Z])/g, (_, c) => `_${c.toLowerCase()}`).trim();

        return {
            number: Number.parseInt(k, 10),
            name:   newKey,
            desc:   tagDesc(newKey),
            type:   'loc-field',
        };
    }),
].sort((a, b) => a.number - b.number);

</script>

<style lang="sass" scoped>
.tag-list
    width: 100%
    border-collapse: collapse

    &, & td
        border: 1px black solid

.type-related-entity
    background-color: lightblue

.type-field
    background-color: lightgrey

.type-loc-field
    background-color: lightgreen

</style>

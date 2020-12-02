<template>
    <q-page>
        <div class="main-input q-ma-xl" />
        <div />
        <div class="control" />
    </q-page>
</template>

<style lang="stylus">
.title-input.index-input
    position absolute
    width calc(100vw - 150px)
    top 100px
</style>

<script>
import magic from 'src/mixins/magic';

export default {
    mixins: [magic],
};
</script>

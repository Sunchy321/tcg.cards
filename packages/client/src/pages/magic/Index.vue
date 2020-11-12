<template>
    <q-page>
        <div class="main-input q-ma-xl">
            <q-input filled size="md">
                <template v-slot:append>
                    <q-btn
                        icon="mdi-shuffle-variant"
                        flat dense round
                    />

                    <q-btn
                        icon="mdi-magnify"
                        flat dense round
                    />
                </template>
            </q-input>
        </div>
        <div />
        <div class="control" />
    </q-page>
</template>

<style lang="stylus" scoped>
.control
    border-radius 3px
    background-color lighten($primary, 80%)
</style>

<script>
export default {};
</script>

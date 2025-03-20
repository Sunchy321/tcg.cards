<script lang="ts">
type T = {
    a: 1;
};

// type IndexKey = {
// [K in keyof T]: T[K] extends number | string ? K : never;
// }[keyof T];

type S = {
    [K in keyof T]: T[K]
}

</script>

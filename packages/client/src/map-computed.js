import { isArrayLike, last } from 'lodash';

function toPairs(options) {
    if (isArrayLike(options)) {
        return options.map(key => [last(key.split('/')), key]);
    } else {
        return Object.entries(options);
    }
}

export default function mapComputed(options) {
    const result = {};

    for (const [field, key] of toPairs(options)) {
        result[field] = {
            get() {
                return this.$store.getters[key];
            },
            set(newValue) {
                this.$store.commit(key, newValue);
            },
        };
    }

    return result;
}

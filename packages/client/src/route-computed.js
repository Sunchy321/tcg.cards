import { pick } from 'lodash';

export default function routeComputed(key, option) {
    const keep = option.keep ?? true;
    const number = option.number ?? false;
    const defaultValue = option.default ?? (number ? 0 : undefined);

    const get = function() {
        const value = this.$route.query[key];

        if (number) {
            if (value == null) {
                return defaultValue;
            }

            const num = Number.parseInt(value);

            if (Number.isNaN(num)) {
                return defaultValue;
            }

            return num;
        } else {
            return value ?? defaultValue;
        }
    };

    const set = function(newValue) {
        if (number && (typeof newValue !== 'number' || Number.isNaN(newValue))) {
            newValue = defaultValue;
        }

        if (get.call(this) === newValue) {
            return;
        }

        const oldQuery = this.$route.query;

        let newQuery;

        if (Array.isArray(keep)) {
            newQuery = { ...pick(oldQuery, keep), [key]: newValue };
        } else if (keep === true) {
            newQuery = { ...oldQuery, [key]: newValue };
        } else {
            newQuery = { [key]: newValue };
        }

        if (defaultValue != null && newValue === defaultValue) {
            delete newQuery[key];
        }

        this.$router.replace({
            query: newQuery,
        });
    };

    return { get, set };
}

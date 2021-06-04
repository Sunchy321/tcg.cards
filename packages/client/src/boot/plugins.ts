import { boot } from 'quasar/wrappers';

import { sync } from 'vuex-router-sync';

import store from 'src/store';
import router from 'src/router';

export default boot(() => {
    sync(store, router);
});

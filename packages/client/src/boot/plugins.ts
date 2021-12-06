import { boot } from 'quasar/wrappers';

import { Store } from 'vuex';
import { sync } from 'vuex-router-sync';

import store from 'src/store';
import router from 'src/router';

export default boot(() => {
    sync(store as unknown as Store<any>, router);
});

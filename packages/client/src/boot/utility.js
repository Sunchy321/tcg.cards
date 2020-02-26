import Vue from 'vue';

Vue.prototype.$sleep = async function(time) {
    return new Promise(resolve => setTimeout(resolve, time));
};

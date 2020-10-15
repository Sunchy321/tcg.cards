
export default function({ Vue }) {
    Vue.prototype.$sleep = async function(time) {
        return new Promise(resolve => setTimeout(resolve, time));
    };
}

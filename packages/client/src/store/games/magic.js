const { generateSetting } = require('./game');

export default generateSetting('magic', {
    cardTextMode: {
        type:    ['oracle', 'unified', 'printed'],
        default: 'unified',
    },
});

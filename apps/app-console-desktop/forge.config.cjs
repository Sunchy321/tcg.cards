module.exports = {
  packagerConfig: {
    name:        'TCG Cards Console',
    appBundleId: 'cards.tcg.console-desktop',
    asar:        true,
    icon:        'resources/icon',
    ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
    // Only bundled code and generated static assets belong in the installation.
    ignore:      path => path !== '' && !/^\/(package\.json$|dist-electron(?:\/|$)|\.output(?:\/|$))/.test(path),
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin'] }],
};

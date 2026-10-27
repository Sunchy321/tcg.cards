const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');
const appRequire = createRequire(__filename);

/** Resolves a package's real directory from the supplied dependency context. */
function packageDirectory(name, packageRequire) {
  let entryPath;
  try {
    entryPath = packageRequire.resolve(name);
  } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
    entryPath = packageRequire.resolve(`${name}/package`);
  }
  let current = dirname(entryPath);
  while (current !== dirname(current)) {
    const manifestPath = join(current, 'package.json');
    try {
      const manifest = JSON.parse(require('node:fs').readFileSync(manifestPath, 'utf8'));
      if (manifest.name === name) return current;
    } catch {
      // Parent directories without package manifests are expected during lookup.
    }
    current = dirname(current);
  }
  throw new Error(`Could not resolve runtime package ${name}`);
}

/** Stages Sharp and its platform modules in a flat layout for Electron Packager. */
async function stageSharpDependencies({ buildPath, platform, arch }) {
  const sharpDirectory = packageDirectory('sharp', appRequire);
  const sharpRequire = createRequire(join(sharpDirectory, 'package.json'));
  const packages = [
    ['sharp', appRequire],
    ['detect-libc', sharpRequire],
    ['semver', sharpRequire],
    ['@img/colour', sharpRequire],
    [`@img/sharp-${platform}-${arch}`, sharpRequire],
    [`@img/sharp-libvips-${platform}-${arch}`, sharpRequire],
  ];
  for (const [name, packageRequire] of packages) {
    const destination = join(buildPath, 'node_modules', name);
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(dirname(destination), { recursive: true });
    await fs.cp(packageDirectory(name, packageRequire), destination, { recursive: true, dereference: true });
  }
}

module.exports = {
  packagerConfig: {
    name:        'TCG Cards Console',
    appBundleId: 'cards.tcg.console-desktop',
    asar:        { unpack: '**/node_modules/{sharp,@img}/**/*' },
    afterCopy:   [stageSharpDependencies],
    prune:       false,
    icon:        'resources/icon',
    ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
    // Runtime image processing needs Sharp and its native support packages.
    ignore:      path => path !== '' && !/^\/(?:package\.json|dist-electron(?:\/.*)?|\.output(?:\/.*)?|node_modules(?:\/(?:sharp|@img|detect-libc|semver)(?:\/.*)?)?)$/.test(path),
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin'] }],
};

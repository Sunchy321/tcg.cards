// Resolves the `bun:test` module for the Electron test files without loading
// Bun's global type augmentations. The main process runs on Node, so globals
// such as ReadableStream must keep their Node/DOM shapes in production code;
// only the test runner module is declared here.
/// <reference types="bun-types/test" />

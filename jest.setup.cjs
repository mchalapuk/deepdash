/* eslint-disable @typescript-eslint/no-require-imports */
require("fake-indexeddb/auto");

if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

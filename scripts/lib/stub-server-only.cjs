/* Test-only CLI preload matching scripts/test-player-display.cjs. */
const Module = require('node:module');
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'server-only') return {};
  return load.call(this, request, parent, isMain);
};

// Run the real publication/reader regression suites with the repository's
// existing TypeScript dependency; no additional runtime package is required.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, file) => {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  module._compile(result.outputText, file);
};
require('../src/lib/bracket/storedPublication.test.ts');
require('../src/lib/newsletter/finishedPublication.test.ts');
require('../src/lib/newsletter/newsletterMasthead.test.ts');
require('../src/lib/newsletter/scheduledPublication.test.ts');
require('../src/lib/statLine.test.ts');
require('../src/lib/nextGameLine.test.ts');
require('./newsletter-season-line.test.ts');

require('../src/lib/newsletter/pictureReadiness.test.ts');
require('./newsletter-unmatched.test.ts');

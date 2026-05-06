// Tesseract.js worker shim — filters noise from the LSTM-only Tesseract Core
// before delegating to the upstream worker. The chi_tra trained-data file
// carries legacy-engine config that the LSTM-only build rejects, producing
// dozens of "Warning: Parameter not found: ..." console.error calls per OCR
// run. They're cosmetic, but pollute DevTools.
//
// Companion worker.min.js is synced from node_modules by
// scripts/sync-tesseract-worker.mjs (runs before dev/build via npm scripts).

(function installConsoleFilter() {
  const NOISE = [
    /^Warning: Parameter not found:/,
    /^Estimating resolution as /,
  ];
  const wrap = (orig) => function (first) {
    if (typeof first === 'string' && NOISE.some((p) => p.test(first))) return;
    return orig.apply(self.console, arguments);
  };
  self.console.error = wrap(self.console.error);
  self.console.warn = wrap(self.console.warn);
  self.console.log = wrap(self.console.log);
})();

// Resolve upstream worker via absolute path. Blob-worker `self.location` is
// `blob:...`, so relative URLs are unreliable — the caller passes the project
// base in via `?base=` (see useOcrEngine.ts) so this script doesn't have to
// hard-code `/ff14-craft-helper/` and survive a base-path rename.
const params = new URLSearchParams(self.location.search);
const base = params.get('base') || '/';
importScripts(self.location.origin + base + 'tesseract-shim/worker.min.js');

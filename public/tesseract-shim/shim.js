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
// `blob:...`, so relative URLs are unreliable — use origin + project base.
importScripts(self.location.origin + '/ff14-craft-helper/tesseract-shim/worker.min.js');

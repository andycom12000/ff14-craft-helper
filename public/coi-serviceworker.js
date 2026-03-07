/*! coi-serviceworker - Enables SharedArrayBuffer on GitHub Pages via Service Worker */
if (typeof window === "undefined") {
  // Service Worker scope
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener("fetch", (e) => {
    if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
    e.respondWith(
      fetch(e.request).then((r) => {
        if (r.status === 0) return r;
        const headers = new Headers(r.headers);
        headers.set("Cross-Origin-Embedder-Policy", "credentialless");
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
      })
    );
  });
} else {
  // Window scope - register the service worker
  (() => {
    const reloadedBySW = window.sessionStorage.getItem("coiReloadedBySW");
    window.sessionStorage.removeItem("coiReloadedBySW");
    if (window.crossOriginIsolated) return;
    if (reloadedBySW === "true") {
      console.warn("coi-serviceworker: Could not achieve cross-origin isolation.");
      return;
    }
    const scripts = document.querySelectorAll('script[src*="coi-serviceworker"]');
    const scriptUrl = scripts.length > 0 ? scripts[0].src : new URL("coi-serviceworker.js", window.location.href).href;
    navigator.serviceWorker
      .register(scriptUrl)
      .then((reg) => {
        if (reg.active && !navigator.serviceWorker.controller) {
          window.sessionStorage.setItem("coiReloadedBySW", "true");
          window.location.reload();
        } else if (!reg.active) {
          const sw = reg.installing || reg.waiting;
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated") {
              window.sessionStorage.setItem("coiReloadedBySW", "true");
              window.location.reload();
            }
          });
        }
      })
      .catch((err) => console.error("coi-serviceworker registration failed:", err));
  })();
}

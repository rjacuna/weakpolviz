/* Web Worker: computes computeGraph(hvec) off the main thread and streams progress.
   location.search carries the ?v=… cache-buster so the imported model.js matches the page. */
importScripts('model.js' + location.search);
onmessage = e => {
  const { hvec, cap } = e.data;
  try {
    const G = computeGraph(hvec, (n, q) => postMessage({ t: 'p', n, q }), cap);
    postMessage({ t: 'ok', G });
  } catch (err) {
    const m = String(err && err.message || err);
    postMessage({ t: 'err', cap: m.indexOf('CAP:') === 0, n: +m.slice(4) || 0, m });
  }
};

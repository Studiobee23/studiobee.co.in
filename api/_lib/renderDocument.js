// CommonJS wrapper — dynamically imports the ESM pdf-template.mjs
// Returns the renderDocument function as a promise.
let _cached;
async function getRenderDocument() {
  if (!_cached) {
    const mod = await import('../../pdf-template.mjs');
    _cached = mod.renderDocument;
  }
  return _cached;
}
module.exports = { getRenderDocument };

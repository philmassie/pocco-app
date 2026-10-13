// Round-trip test: encode synthetic POCCO-style frames with a tiny msgpack encoder, decode with unpack().
const assert = require("assert");
const { unpack } = require("../www/msgpack.js");

function enc(x) {
  const te = new TextEncoder(), out = [];
  (function w(v) {
    if (v === null) out.push(0xc0);
    else if (v === true) out.push(0xc3);
    else if (v === false) out.push(0xc2);
    else if (typeof v === "number") {
      if (Number.isInteger(v) && v >= 0 && v < 128) out.push(v);
      else if (Number.isInteger(v) && v >= 128 && v < 65536) out.push(0xcd, v >> 8, v & 255);
      else if (Number.isInteger(v) && v < 0 && v >= -32) out.push(256 + v);
      else { const b = Buffer.alloc(8); b.writeDoubleBE(v); out.push(0xcb, ...b); }
    } else if (typeof v === "string") {
      const b = te.encode(v);
      if (b.length < 32) out.push(0xa0 | b.length); else out.push(0xd9, b.length);
      out.push(...b);
    } else if (Array.isArray(v)) { out.push(0x90 | v.length); v.forEach(w); }
    else { const k = Object.keys(v); out.push(0x80 | k.length); k.forEach(key => { w(key); w(v[key]); }); }
  })(x);
  return Uint8Array.from(out).buffer;
}

const frame = {
  command: "update:components",
  widgets: [{ id: 2, v: "1.80" }, { id: 3, v: 88.5 }, { id: 4, v: 0 }, { id: 5, v: 412 }, { id: 6, v: "13.8" }, { id: 8, v: "5:42" }, { id: 9, v: null }],
};
assert.deepStrictEqual(unpack(enc(frame)), frame);
assert.deepStrictEqual(unpack(enc({ command: "ping" })), { command: "ping" });
assert.deepStrictEqual(unpack(enc({ n: -5, t: true, f: false, big: 1234 })), { n: -5, t: true, f: false, big: 1234 });
// Node Buffer / typed-array views with an offset must work too
const ab = enc(frame), padded = new Uint8Array(ab.byteLength + 3); padded.set(new Uint8Array(ab), 3);
assert.deepStrictEqual(unpack(padded.subarray(3)), frame);
console.log("decode tests passed");

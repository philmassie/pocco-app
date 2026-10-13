// Minimal MessagePack decoder (browser + Node). Covers the types the POCCO+ appears to use,
// plus the other common ones so an unexpected frame doesn't kill the page.
function unpack(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const raw = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const td = new TextDecoder();
  let p = 0;
  const str = n => { const s = td.decode(raw.subarray(p, p + n)); p += n; return s; };
  const bin = n => { const b = raw.slice(p, p + n); p += n; return b; };
  const arr = n => { const a = []; while (n--) a.push(rd()); return a; };
  const map = n => { const o = {}; while (n--) { const k = rd(); o[k] = rd(); } return o; };
  const u8 = () => v.getUint8(p++);
  const u16 = () => { const x = v.getUint16(p); p += 2; return x; };
  const u32 = () => { const x = v.getUint32(p); p += 4; return x; };
  function rd() {
    const t = u8();
    if (t < 0x80) return t;
    if (t >= 0xe0) return t - 256;
    if ((t & 0xf0) === 0x80) return map(t & 15);
    if ((t & 0xf0) === 0x90) return arr(t & 15);
    if ((t & 0xe0) === 0xa0) return str(t & 31);
    switch (t) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(u8());
      case 0xc5: return bin(u16());
      case 0xc6: return bin(u32());
      case 0xca: { const x = v.getFloat32(p); p += 4; return x; }
      case 0xcb: { const x = v.getFloat64(p); p += 8; return x; }
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xcf: { const hi = u32(), lo = u32(); return hi * 4294967296 + lo; }
      case 0xd0: { const x = v.getInt8(p); p += 1; return x; }
      case 0xd1: { const x = v.getInt16(p); p += 2; return x; }
      case 0xd2: { const x = v.getInt32(p); p += 4; return x; }
      case 0xd9: return str(u8());
      case 0xda: return str(u16());
      case 0xdb: return str(u32());
      case 0xdc: return arr(u16());
      case 0xdd: return arr(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
    }
    throw new Error("unsupported msgpack type 0x" + t.toString(16));
  }
  return rd();
}
if (typeof module !== "undefined") module.exports = { unpack };

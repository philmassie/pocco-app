const assert = require("assert");
const L = require("../www/logic.js");

// time + file names (built from local components so the test is timezone-independent)
const t1 = new Date(2026, 9, 12, 20, 58, 3).getTime();
const t2 = new Date(2026, 9, 12, 21, 35, 11).getTime();
assert.strictEqual(L.fmtLocal(t1), "2026-10-12 20:58:03");
assert.strictEqual(L.fileName(t1, t2), "2026-10-12_20-58-03--2026-10-12_21-35-11.csv");
const tripId = L.createTripId();
assert.match(tripId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

// csv cells: blanks for missing/NaN, quoting when needed
assert.strictEqual(L.csvCell(null), "");
assert.strictEqual(L.csvCell(NaN), "");
assert.strictEqual(L.csvCell(0), "0");
assert.strictEqual(L.csvCell('a,"b"'), '"a,""b"""');
const csv = L.buildCsv([
  { tripId, t: t1, clock: 12, coolant: 88.5, oil: 2.4, egt: 410, battery: 13.8, level: 0, flags: "egt_CA;oil_AL", lat: -25.123456, lon: 25.5, acc: 6.2, speed: null, heading: NaN, alt: 1200.5, gpsAge: 0.4 },
  { tripId, t: t2, clock: 13, coolant: 88.6, oil: 2.4, egt: 411, battery: 13.8, level: 0 },
]).split("\r\n");
assert.strictEqual(csv[0], "trip_id,datetime_local,session_clock_s,coolant_C,oil_bar,egt_C,battery_V,coolant_level,flags,lat,lon,accuracy_m,speed_kmh,heading_deg,altitude_m,gps_age_s");
assert.strictEqual(csv[1], `${tripId},2026-10-12 20:58:03,12,88.5,2.4,410,13.8,0,egt_CA;oil_AL,-25.123456,25.5,6.2,,,1200.5,0.4`);
assert.strictEqual(csv[2], `${tripId},2026-10-12 21:35:11,13,88.6,2.4,411,13.8,0,,,,,,,,`);
assert.strictEqual(csv[3], ""); // trailing newline

// clock parsing
assert.strictEqual(L.clockSeconds(342), 342);
assert.strictEqual(L.clockSeconds("5:42"), 342);
assert.strictEqual(L.clockSeconds("1:05:42"), 3942);
assert.strictEqual(L.clockSeconds("12.5"), 12.5);
assert.ok(Number.isNaN(L.clockSeconds("abc")));

// tick steps
assert.strictEqual(L.niceStep(6, 5), 1);
assert.strictEqual(L.niceStep(90, 5), 20);
assert.strictEqual(L.niceStep(800, 5), 200);

// trend: +1 per 10 s = +6 per minute; flat = 0; too little data = null
{
  const tr = new L.Trend(30000, 10000);
  for (let i = 0; i < 4; i++) tr.add(i * 1000, i); assert.strictEqual(tr.slopePerMin(), null);
  tr.reset(); for (let i = 0; i <= 30; i++) tr.add(i * 1000, 80 + i / 10);
  assert.ok(Math.abs(tr.slopePerMin() - 6) < 1e-6);
  tr.reset(); for (let i = 0; i <= 30; i++) tr.add(i * 1000, 90);
  assert.ok(Math.abs(tr.slopePerMin()) < 1e-9);
  // window drops old samples
  tr.reset(); for (let i = 0; i <= 120; i++) tr.add(i * 1000, i < 60 ? 100 : 100 - (i - 60));
  assert.ok(tr.slopePerMin() < -50);
}

// oil arming: zero at start must not arm; needs sustained pressure; latches; optional warm gate
{
  const a = new L.OilArm({ bar: 1, sec: 20, coolantC: null });
  for (let s = 0; s < 10; s++) assert.strictEqual(a.update(s * 1000, 0, 40), false); // cranking / stopped
  for (let s = 10; s < 29; s++) assert.strictEqual(a.update(s * 1000, 3, 40), false);  // 19 s of pressure so far
  assert.strictEqual(a.update(30000, 3, 40), true);                                   // 20 s reached
  assert.strictEqual(a.update(31000, 0, 40), true);                                   // latched: a later drop still counts
  a.reset(); assert.strictEqual(a.armed, false);
  // dip before arming restarts the timer
  a.update(0, 3, 40); a.update(15000, 0.5, 40); a.update(16000, 3, 40);
  assert.strictEqual(a.update(35000, 3, 40), false);
  assert.strictEqual(a.update(36000, 3, 40), true);
  // warm gate
  const w = new L.OilArm({ bar: 1, sec: 5, coolantC: 60 });
  for (let s = 0; s < 20; s++) w.update(s * 1000, 3, 40);
  assert.strictEqual(w.armed, false);
  for (let s = 20; s < 30; s++) w.update(s * 1000, 3, 70);
  assert.strictEqual(w.armed, true);
}

// debounce: a 1 s blip is ignored, a sustained change flips after the hold time, and back again
{
  const d = new L.Debounce(2000);
  assert.strictEqual(d.update(0, false), false);
  assert.strictEqual(d.update(1000, true), false);
  assert.strictEqual(d.update(1500, false), false);      // blip ended
  d.update(3000, true); assert.strictEqual(d.update(4000, true), false);
  assert.strictEqual(d.update(5000, true), true);        // held 2 s
  assert.strictEqual(d.update(6000, false), true);
  assert.strictEqual(d.update(8100, false), false);
}
console.log("logic tests passed");

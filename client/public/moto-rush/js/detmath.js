// fdlibm/musl ports of sin, cos, atan2, hypot and pow, identical in every engine. Load before planck.
(function (root) {
  'use strict';
  const M = root.Math;
  const sqrt = M.sqrt, abs = M.abs;
  const buf = new DataView(new ArrayBuffer(8));
  const hiWord = x => { buf.setFloat64(0, x); return buf.getUint32(0); };
  const loWord = x => { buf.setFloat64(0, x); return buf.getUint32(4); };
  const fromWords = (hi, lo) => { buf.setUint32(0, hi >>> 0); buf.setUint32(4, lo >>> 0); return buf.getFloat64(0); };

  const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
    S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
  const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
    C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
  const invpio2 = 6.36619772367581382433e-01, toint = 6755399441055744,
    pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
    pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21,
    pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;

  function kSin(x, y, iy) {
    const z = x * x, w = z * z, r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6), v = z * x;
    return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
  }
  function kCos(x, y) {
    const z = x * x, w = z * z, r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
    const hz = 0.5 * z, w1 = 1.0 - hz;
    return w1 + (((1.0 - w1) - hz) + (z * r - x * y));
  }
  let ry0 = 0, ry1 = 0;
  function remPio2(x) {
    const fn = (x * invpio2 + toint) - toint;
    let r = x - fn * pio2_1, w = fn * pio2_1t, t;
    t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w);
    t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w);
    ry0 = r - w; ry1 = (r - ry0) - w;
    return fn;
  }
  function sin(x) {
    x = +x;
    if (x !== x || x === Infinity || x === -Infinity) return NaN;
    if (abs(x) <= 0.7853981633974483) return abs(x) < 7.450580596923828e-9 ? x : kSin(x, 0, 0);
    const n = remPio2(x) & 3;
    return n === 0 ? kSin(ry0, ry1, 1) : n === 1 ? kCos(ry0, ry1) : n === 2 ? -kSin(ry0, ry1, 1) : -kCos(ry0, ry1);
  }
  function cos(x) {
    x = +x;
    if (x !== x || x === Infinity || x === -Infinity) return NaN;
    if (abs(x) <= 0.7853981633974483) return abs(x) < 1.4901161193847656e-8 ? 1.0 : kCos(x, 0);
    const n = remPio2(x) & 3;
    return n === 0 ? kCos(ry0, ry1) : n === 1 ? -kSin(ry0, ry1, 1) : n === 2 ? -kCos(ry0, ry1) : kSin(ry0, ry1, 1);
  }

  const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
  const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
  const aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
  function atan(x) {
    x = +x;
    if (x !== x) return NaN;
    const neg = x < 0 || (x === 0 && 1 / x < 0);
    let ax = abs(x), id;
    if (ax >= 7.378697629483821e19) return neg ? -atanhi[3] : atanhi[3]; // 2^66
    if (ax < 0.4375) {
      if (ax < 7.450580596923828e-9) return x; // 2^-27
      id = -1;
    } else if (ax < 1.1875) {
      if (ax < 0.6875) { id = 0; ax = (2.0 * ax - 1.0) / (2.0 + ax); }
      else { id = 1; ax = (ax - 1.0) / (ax + 1.0); }
    } else if (ax < 2.4375) { id = 2; ax = (ax - 1.5) / (1.0 + 1.5 * ax); }
    else { id = 3; ax = -1.0 / ax; }
    const v = id < 0 ? x : ax;
    const z = v * v, w = z * z;
    const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
    const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
    if (id < 0) return v - v * (s1 + s2);
    const r = atanhi[id] - ((v * (s1 + s2) - atanlo[id]) - v);
    return neg ? -r : r;
  }
  const PI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16;
  const isNeg = v => v < 0 || (v === 0 && 1 / v < 0);
  function atan2(y, x) {
    y = +y; x = +x;
    if (x !== x || y !== y) return NaN;
    if (x === 1) return atan(y);
    const m = (isNeg(y) ? 1 : 0) | (isNeg(x) ? 2 : 0);
    if (y === 0) return m === 0 || m === 1 ? y : m === 2 ? PI : -PI;
    if (x === 0) return m & 1 ? -PI / 2 : PI / 2;
    if (x === Infinity || x === -Infinity) {
      if (y === Infinity || y === -Infinity) return [PI / 4, -PI / 4, 3 * PI / 4, -3 * PI / 4][m];
      return [0, -0, PI, -PI][m];
    }
    if (y === Infinity || y === -Infinity) return m & 1 ? -PI / 2 : PI / 2;
    const q = abs(y / x);
    if (q > 1.8446744073709552e19) return m & 1 ? -PI / 2 : PI / 2; // |y/x| > 2^64
    const z = (m & 2) && q < 5.421010862427522e-20 ? 0 : atan(q); // |y/x| < 2^-64 with x < 0
    return m === 0 ? z : m === 1 ? -z : m === 2 ? PI - (z - PI_LO) : (z - PI_LO) - PI;
  }

  function hypot() {
    let inf = false, nan = false, s = 0;
    for (let i = 0; i < arguments.length; i++) {
      const v = +arguments[i];
      if (v === Infinity || v === -Infinity) inf = true;
      else if (v !== v) nan = true;
      else s += v * v;
    }
    return inf ? Infinity : nan ? NaN : sqrt(s);
  }

  const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10,
    Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
    Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
    Lg7 = 1.479819860511658591e-01;
  function log(x) {
    x = +x;
    if (x !== x || x < 0) return NaN;
    if (x === 0) return -Infinity;
    if (x === Infinity) return Infinity;
    let k = 0;
    if (x < 2.2250738585072014e-308) { k -= 54; x *= 18014398509481984; } // 2^54
    let hx = hiWord(x);
    const lx = loWord(x);
    if (hx === 0x3ff00000 && lx === 0) return 0;
    hx += 0x3ff00000 - 0x3fe6a09e;
    k += (hx >>> 20) - 0x3ff;
    hx = (hx & 0x000fffff) + 0x3fe6a09e;
    x = fromWords(hx, lx);
    const f = x - 1.0, hfsq = 0.5 * f * f, s = f / (2.0 + f), z = s * s, w = z * z;
    const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
    const R = t2 + t1, dk = k;
    return s * (hfsq + R) + dk * ln2_lo - hfsq + f + dk * ln2_hi;
  }
  const invln2 = 1.44269504088896338700e+00,
    P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
    P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
  const pow2 = k => fromWords((k + 0x3ff) << 20, 0);
  function exp(x) {
    x = +x;
    if (x !== x) return NaN;
    if (x > 709.782712893383973096) return Infinity;
    if (x < -745.13321910194110842) return 0;
    const ax = abs(x);
    let k, hi, lo;
    if (ax > 0.34657359027997264) { // 0.5 ln2
      k = ax >= 1.0397207708399179 ? (invln2 * x + (x < 0 ? -0.5 : 0.5)) | 0 : (x < 0 ? -1 : 1); // 1.5 ln2
      hi = x - k * ln2_hi; lo = k * ln2_lo; x = hi - lo;
    } else if (ax > 3.725290298461914e-9) { k = 0; hi = x; lo = 0; } // 2^-28
    else return 1 + x;
    const xx = x * x, c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
    const y = 1 + (x * c / (2 - c) - lo + hi);
    if (k === 0) return y;
    return k > 1000 ? y * pow2(1000) * pow2(k - 1000) : k < -1000 ? y * pow2(-1000) * pow2(k + 1000) : y * pow2(k);
  }
  function pow(x, y) {
    x = +x; y = +y;
    if (y === 0) return 1;
    if (x !== x || y !== y) return NaN;
    if (y === (y | 0) && abs(y) <= 1024) {
      let n = abs(y), b = x, r = 1;
      while (n) { if (n & 1) r *= b; b *= b; n >>>= 1; }
      return y < 0 ? 1 / r : r;
    }
    if (x === 0) return y > 0 ? 0 : Infinity;
    if (x < 0) return NaN;
    if (x === Infinity) return y > 0 ? Infinity : 0;
    return exp(y * log(x));
  }

  const det = { sin, cos, atan, atan2, hypot, log, exp, pow };
  for (const k of Object.keys(det)) M[k] = det[k];
  root.MotoDetMath = det;
})(typeof self !== 'undefined' ? self : this);

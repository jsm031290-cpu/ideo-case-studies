// Generates the collision-free intro choreographies baked into index.html.
// Run: node tools/intro-plans.mjs > tools/plans.json, then paste into INTRO_PLANS.
// (Planning at runtime took up to ~4s with the no-contact rule, so it is baked.)
const easeIn = p => (p ? 2 ** (10 * (p - 1)) : 0); // GSAP expo
const gsap = { parseEase: () => p => (p < .5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2) };
/* Intro choreography — like the first version: pieces start scattered and
   rotated on a grid, then snap home in separate hops (↔ / ↕ / 90° turns) that
   overlap in time. To guarantee no two pieces ever overlap, the plan is built
   backwards: starting assembled, pieces "explode" one checked hop at a time
   (each hop is rejected if its sweep would touch another piece), then the
   whole thing is played in reverse. expo.inOut is symmetric, so the reversed
   paths are the exact same collision-free paths. */
const BOX = [ // piece bounding boxes in viewBox units [x, y, w, h]
  [0, 0, 26, 50], [0, 50, 26, 50], [42, 0, 26, 100], [68, 0, 50, 100], [134, 0, 26, 100],
  [160, 0, 40, 24], [160, 38, 32, 24], [160, 76, 40, 24], [216, 0, 50, 100], [266, 0, 50, 100],
];
const U = 34, BEAT = .16, D = .5, T0 = .6;
const LETTER = [0, 0, 1, 1, 2, 2, 2, 2, 3, 3]; // piece → letter, so a letter's pieces travel together
const EASE = gsap.parseEase('expo.inOut');
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

// value of one prop at time t (moves of one piece never overlap each other)
function val(p, k, t) {
  const ms = p.moves.filter(m => k in m.v && m.t < t);
  if (!ms.length) return p.from[k];
  const m = ms.at(-1), st = val(p, k, m.t);
  return st + (m.v[k] - st) * EASE(Math.min(1, (t - m.t) / D));
}
function box(p, i, t) {
  const [x, y, w, h] = BOX[i], r = val(p, 'rotation', t) * Math.PI / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const W = w * c + h * s, H = w * s + h * c, cx = x + w / 2 + val(p, 'x', t), cy = y + h / 2 + val(p, 'y', t);
  return [cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2];
}
const SEP = 8; // min air between two pieces that are both still away from home
const atHome = (p, t) => ['x', 'y', 'rotation'].every(k => Math.abs(val(p, k, t)) < .01);
// does piece i collide during [t0, t1]? A piece may only touch another when one of
// them is already home (docking). Two loose pieces must keep SEP apart, otherwise
// they read as already joined and appear to travel together.
function hit(P, i, t0, t1) {
  for (let t = t0; t <= t1 + .001; t += .01) {
    const a = box(P[i], i, t), ah = atHome(P[i], t);
    for (let j = 0; j < P.length; j++) {
      if (j === i) continue;
      const b = box(P[j], j, t), g = ah || atHome(P[j], t) ? -.5 : SEP;
      if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > -g && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > -g) return true;
    }
  }
  return false;
}
function explode() {
  const P = BOX.map(() => ({ from: { x: 0, y: 0, rotation: 0 }, moves: [] }));
  // two long moves per piece instead of 3-4 short hops, and pieces leave by letter
  // (right to left) so that, played in reverse, the word builds I → D → E → O
  const want = BOX.map(() => 2), next = BOX.map((_, i) => (3 - LETTER[i]) * 2 + rnd(2)), last = BOX.map(() => '');
  for (let b = 0; b < 80 && P.some((p, i) => p.moves.length < want[i]); b++) {
    const t = b * BEAT;
    for (const i of shuffle([...P.keys()])) {
      if (P[i].moves.length >= want[i] || next[i] > b) continue;
      const cands = shuffle(['x', 'y', 'rotation'].filter(k => k !== last[i])).flatMap(k => shuffle([-1, 1]).map(sg => {
        const step = k === 'rotation' ? 90 : k === 'x' ? (1 + rnd(2)) * U : (1 + rnd(1)) * U;
        return { [k]: val(P[i], k, t) + sg * step };
      }));
      next[i] = b + 1; // retry next beat if every candidate collides
      for (const v of cands) {
        P[i].moves.push({ t, v });
        // a piece's two moves overlap slightly, so it flows instead of stopping between them
        if (!hit(P, i, t, t + D)) { last[i] = Object.keys(v)[0]; next[i] = b + Math.max(1, Math.ceil(D / BEAT) - 2); break; }
        P[i].moves.pop();
      }
    }
  }
  return P;
}
function planIntro() {
  let P, n = 0;
  const spread = P => { // every piece really scattered, with air between them
    const B = P.map((p, i) => box(p, i, 99));
    return P.every(p => Math.abs(val(p, 'x', 99)) + Math.abs(val(p, 'y', 99)) >= 2 * U) &&
      B.every((a, i) => B.every((b, j) => j <= i || Math.min(a[2], b[2]) - Math.max(a[0], b[0]) < -6 || Math.min(a[3], b[3]) - Math.max(a[1], b[1]) < -6));
  };
  do { P = explode(); n++; } while (n < 80 && !spread(P));
  const Tr = Math.max(...P.flatMap(p => p.moves.map(m => m.t + D)));
  const plan = P.map(p => ({
    from: { x: val(p, 'x', 99), y: val(p, 'y', 99), rotation: val(p, 'rotation', 99) },
    moves: p.moves.map(m => { const k = Object.keys(m.v)[0]; return { t: T0 + Tr - m.t - D, v: { [k]: val(p, k, m.t) } }; }).reverse(),
  }));
  return { plan, end: T0 + Tr };
}


const r = n => Math.round(n * 1000) / 1000;
const out = [];
while (out.length < 16) {
  const p = planIntro();
  if (p.end > 4.6) continue;
  out.push({ end: r(p.end), plan: p.plan.map(q => ({
    from: { x: r(q.from.x), y: r(q.from.y), rotation: r(q.from.rotation) },
    moves: q.moves.map(m => ({ t: r(m.t), v: Object.fromEntries(Object.entries(m.v).map(([k, v]) => [k, r(v)])) })),
  })) });
}
console.log(JSON.stringify(out));

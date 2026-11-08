// Cipher Key — github.com/veraetogrex-portfolio · zero dependencies
// A key sweeps across the message and every letter bursts into its ciphertext byte.
// The friend with the same key turns it back; the eavesdropper only ever sees noise.
// The cipher is XOR with a random key: a teaching toy. For real data use crypto.subtle (AES-GCM).

const root    = document.querySelector('#cipher');
const canvas  = root.querySelector('.ck-canvas');
const scan    = root.querySelector('.ck-scan');
const modeEl  = root.querySelector('.ck-mode');
const keyEl   = root.querySelector('.ck-keyhex');
const input   = root.querySelector('.ck-input');
const go      = root.querySelector('.ck-go');
const out     = root.querySelector('.ck-out');
const caption = root.querySelector('.ck-caption');
const friend  = root.querySelector('.ck-friend');
const spy     = root.querySelector('.ck-spy');

// 5×7 dot font: a character, then 7 rows, each row one base-32 digit (5 bits)
const FONT = 'AehhvhhhBuhhuhhuCehgggheDuhhhhhuEvgguggvFvggugggGehgnhhfHhhhvhhhIe44444eJ72222icKhikokihLggggggvMhrllhhhNhhpljhhOehhhhhePuhhugggQehhhlidRuhhukihSfgge11uTv444444UhhhhhheVhhhhha4WhhhlllaXhha4ahhYhha4444Zv1248gv0ehjlphe14c4444e2eh1248v3v2421he426aiv225vgu11he668guhhe7v1248888ehhehhe9ehhf12c 0000000!4444404?eh12404.00000cc-000v000';
const GLYPH = {};
for (let i = 0; i < FONT.length; i += 8) GLYPH[FONT[i]] = [...FONT.slice(i + 1, i + 8)].map(c => parseInt(c, 32));

// the cipher: XOR every byte with the key
const hex   = b => b.toString(16).toUpperCase().padStart(2, '0');
const bytes = s => [...s].map(c => c.charCodeAt(0));
const xor   = (data, k) => data.map((b, i) => b ^ k[i % k.length]);
let key = root.dataset.key ? root.dataset.key.split(' ').map(h => parseInt(h, 16)) : [...crypto.getRandomValues(new Uint8Array(6))];

// helpers: seeded random (same burst every run), tween, cancellable wait
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let gen = 0;                                             // bumps on reset: running sequences stop
const live = g => { if (g !== gen) throw 'cancelled'; };
const wait = (ms, g) => new Promise((ok, no) => setTimeout(() => g === gen ? ok() : no('cancelled'), ms));
const ease = { io: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2, out: t => 1 - (1 - t) ** 3 };
const tween = (ms, fn, g, e = ease.io) => new Promise((ok, no) => {
  const t0 = performance.now();
  const step = now => { if (g !== gen) return no('cancelled'); const p = Math.min(1, (now - t0) / ms); fn(e(p)); p < 1 ? requestAnimationFrame(step) : ok(); };
  requestAnimationFrame(step);
});

// ── the screen ───────────────────────────────────────
const W = 1180, H = 300, ctx = canvas.getContext('2d');
canvas.width = W * 2; canvas.height = H * 2; ctx.scale(2, 2);   // sharp when zoomed
const WHITE = [242, 243, 247], PULSE = [166, 155, 255], ION = [63, 224, 208];
const LETTER = { pitch: 20, r: 7.2 }, BYTE = { pitch: 10, r: 3.9 };

let msg = input.value, slots = [];                       // one slot per character
const centers = n => { const s = Math.min(170, 1080 / n); return [...Array(n)].map((_, i) => W / 2 + (i - (n - 1) / 2) * s); };

function glyphDots(ch, x, y, f) {
  const out = [];
  (GLYPH[ch] || GLYPH[' ']).forEach((row, r) => { for (let c = 0; c < 5; c++) if (row & (16 >> c)) out.push({ x: x + c * f.pitch, y: y + r * f.pitch, r: f.r }); });
  return out;
}
const letterDots = (ch, cx) => glyphDots(ch, cx - 2 * LETTER.pitch, H / 2 - 3 * LETTER.pitch, LETTER);
const byteDots = (b, cx) => {
  const [a, z] = hex(b), w = 4 * BYTE.pitch, gap = 2.4 * BYTE.pitch, y = H / 2 - 3 * BYTE.pitch;
  return [...glyphDots(a, cx - gap / 2 - w, y, BYTE), ...glyphDots(z, cx + gap / 2, y, BYTE)];
};

// 1 · a slot bursts: every dot flies to a dot of the new glyph along a scattered arc
function morph(slot, targets, color, ms = 640, kick = 1) {
  const from = slot.dots, n = Math.max(from.length, targets.length);
  const order = d => d.x + d.y * .37;
  from.sort((a, b) => order(a) - order(b)); targets.sort((a, b) => order(a) - order(b));
  slot.flight = [...Array(n)].map((_, k) => {
    const a = from[Math.floor(k * from.length / n)] || targets[0], b = targets[Math.floor(k * targets.length / n)];
    const ang = rand() * Math.PI * 2, len = (50 + rand() * 90) * kick;
    return { a, b, c: slot.color, c2: color, k: kick, mx: (a.x + b.x) / 2 + Math.cos(ang) * len, my: (a.y + b.y) / 2 + (Math.sin(ang) * len - 30) * kick, delay: rand() * 160 * kick };
  });
  slot.t0 = performance.now(); slot.ms = ms;
  slot.dots = targets.map(d => ({ ...d })); slot.color = color;
}

function setMessage(text, color = WHITE) {
  msg = text; const cx = centers(text.length);
  slots = [...text].map((ch, i) => ({ cx: cx[i], dots: letterDots(ch, cx[i]), color, flight: null }));
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function draw(now) {
  ctx.clearRect(0, 0, W, H);
  for (const s of slots) {                               // dim LED matrix behind each letter
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) { ctx.beginPath(); ctx.arc(s.cx + (c - 2) * LETTER.pitch, H / 2 + (r - 3) * LETTER.pitch, 3, 0, 7); ctx.fill(); }
    if (s.flight) {
      let done = true;
      for (const f of s.flight) {
        const p = Math.min(1, Math.max(0, (now - s.t0 - f.delay) / s.ms)), t = ease.io(p), u = 1 - t;
        if (p < 1) done = false;
        const x = u * u * f.a.x + 2 * u * t * f.mx + t * t * f.b.x, y = u * u * f.a.y + 2 * u * t * f.my + t * t * f.b.y;
        const r = (f.a.r + (f.b.r - f.a.r) * t) * (1 - .55 * f.k * Math.sin(Math.PI * p));
        ctx.fillStyle = `rgb(${mix(f.c, f.c2, t)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      if (done) s.flight = null; else continue;
    }
    ctx.fillStyle = `rgb(${s.color})`; ctx.shadowColor = `rgba(${s.color},.55)`; ctx.shadowBlur = 14;
    for (const d of s.dots) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); }
    ctx.shadowBlur = 0;
  }
  requestAnimationFrame(draw);
}

// 2 · the key sweeps across the screen; each slot bursts as the key passes its centre
async function sweep(dir, ms, onPass, g) {
  const x0 = dir > 0 ? -60 : W + 60, x1 = dir > 0 ? W + 60 : -60;
  const passed = new Set();
  scan.style.opacity = 1;
  await tween(ms, t => {
    const x = x0 + (x1 - x0) * t;
    scan.style.transform = `translateX(${x}px)`;
    slots.forEach((s, i) => { if (!passed.has(i) && (dir > 0 ? x >= s.cx - 20 : x <= s.cx + 20)) { passed.add(i); onPass(s, i); } });
  }, g, t => t);
  scan.style.opacity = 0;
}

// 3 · text that scrambles through hex before it lands
const NOISE = '0123456789ABCDEF';
function scramble(el, text, ms, g) {
  const t0 = performance.now();
  return new Promise(ok => {
    const step = now => {
      if (g !== gen) return ok();
      const p = Math.min(1, (now - t0) / ms), fixed = Math.floor(p * text.length);
      el.textContent = [...text].map((c, i) => i < fixed || c === ' ' ? c : NOISE[(Math.random() * 16) | 0]).join('');
      p < 1 ? requestAnimationFrame(step) : ok();
    };
    requestAnimationFrame(step);
  });
}
const sees = r => r.querySelector('.ck-sees');
function mark(r, sign) { const m = document.createElement('span'); m.className = 'ck-mark'; m.textContent = sign; sees(r).appendChild(m); }
function say(text, tone = '') { caption.textContent = text; caption.className = 'ck-caption' + (tone ? ' is-' + tone : ''); }

let state = 'plain';

async function encrypt(g = gen) {
  try {
    state = 'busy'; go.disabled = true; input.disabled = true;
    const cipher = xor(bytes(msg), key);
    say('A key turns it into ciphertext.');
    await sweep(+1, 1500, (s, i) => morph(s, byteDots(cipher[i], s.cx), PULSE), g);
    out.textContent = `${msg} → ${cipher.map(hex).join(' ')}`;
    for (const r of [friend, spy]) { r.classList.remove('is-plain'); sees(r).classList.add('is-hex'); scramble(sees(r), cipher.map(hex).join(' '), 420, g); }
    await wait(520, g);
    spy.classList.add('is-bad'); mark(spy, '✕');
    say('Without the key, it’s just noise.', 'bad');
    state = 'cipher'; go.textContent = 'Decrypt'; go.classList.add('is-dec'); go.disabled = false;
  } catch (e) { if (e !== 'cancelled') throw e; }
}

async function decrypt(g = gen) {
  try {
    state = 'busy'; go.disabled = true;
    modeEl.classList.add('is-dec'); scramble(modeEl, 'Decryption', 380, g);
    say('The same key turns it back.');
    await sweep(-1, 1500, (s, i) => morph(s, letterDots(msg[i], s.cx), ION), g);
    out.textContent = `${xor(bytes(msg), key).map(hex).join(' ')} → ${msg}`;
    sees(friend).classList.remove('is-hex'); await scramble(sees(friend), msg, 380, g);
    friend.classList.add('is-good'); mark(friend, '✓');
    say('Only the key holder can read it.', 'good');
    state = 'done'; go.textContent = 'Again'; go.classList.remove('is-dec'); go.disabled = false;
  } catch (e) { if (e !== 'cancelled') throw e; }
}

// back to plain text, softly: green dots cool down to white, the readers see the message again
async function restore(g = gen) {
  try {
    state = 'busy';
    slots.forEach(s => morph(s, s.dots.map(d => ({ ...d })), WHITE, 520, 0));
    modeEl.classList.remove('is-dec'); scramble(modeEl, 'Encryption', 360, g);
    paintReaders(); say('Plain text. Anyone can read it.');
    await wait(520, g);
    state = 'plain'; go.textContent = 'Encrypt'; go.disabled = false; input.disabled = false;
  } catch (e) { if (e !== 'cancelled') throw e; }
}

function paintReaders() {
  for (const r of [friend, spy]) { r.classList.remove('is-good', 'is-bad'); sees(r).className = 'ck-sees'; sees(r).textContent = msg; }
  spy.classList.add('is-plain');
  out.textContent = `ascii ${bytes(msg).map(hex).join(' ')}`;
}

function reset() {
  gen++; state = 'plain';
  setMessage(msg); paintReaders(); say('Plain text. Anyone can read it.');
  modeEl.textContent = 'Encryption'; modeEl.classList.remove('is-dec');
  scan.style.opacity = 0; go.textContent = 'Encrypt'; go.classList.remove('is-dec'); go.disabled = false; input.disabled = false;
  keyEl.textContent = key.map(hex).join(' ');
  seed = 7;
}

// ── wiring ───────────────────────────────────────────
root.querySelector('.ck-form').addEventListener('submit', e => {
  e.preventDefault();
  if (state === 'plain') encrypt(); else if (state === 'cipher') decrypt(); else if (state === 'done') restore();
});
input.addEventListener('input', () => {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9 !?.-]/g, '');
  if (state === 'plain' && input.value) { msg = input.value; reset(); }
});
root.querySelector('.ck-newkey').addEventListener('click', () => {
  if (state !== 'plain') return;
  key = [...crypto.getRandomValues(new Uint8Array(6))]; keyEl.textContent = key.map(hex).join(' ');
});

setMessage(msg); reset();
requestAnimationFrame(draw);
root.cipher = { encrypt, decrypt, restore, reset };       // for scripted demos

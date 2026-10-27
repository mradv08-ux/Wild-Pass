'use strict';
/* =====================================================================
   Wild Pass · The Wild Side
   App de fidelización conectada a Supabase.
   ===================================================================== */

const cfg = window.TWS_CONFIG || {};
const CONFIGURED = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/PEGA_AQUI/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
const sb = CONFIGURED && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const KINDS = { actividad: 'Actividad', evento: 'Evento', merch: 'Merch', comunidad: 'Comunidad' };
const CATS = ['Premio rápido', 'Merch', 'Actividades', 'Prioridad', 'Experiencia', 'Digital', 'Causa'];
const BADGES = [
  { name: 'Recluta', ch: 'I', need: 1 }, { name: 'Carroñero', ch: 'II', need: 2 },
  { name: 'Explorador de Ruinas', ch: 'III', need: 3 }, { name: 'Rastreador del Yermo', ch: 'IV', need: 5 },
  { name: 'Guardián del Refugio', ch: 'V', need: 7 }, { name: 'Cazador de Sombras', ch: 'VI', need: 10 },
  { name: 'Señor del Páramo', ch: 'VII', need: 15 }, { name: 'Caminante del Fin del Mundo', ch: 'VIII', need: 20 },
  { name: 'Leyenda de la Zona Cero', ch: 'IX', need: 30 }, { name: 'El Último Superviviente', ch: 'X', need: 50 }
];
const TABLE = { earn: 'earn_items', rewards: 'rewards', challenges: 'challenges', events: 'events', tasks: 'tasks' };
const FORM_OF = { earn: 'hEarn', rewards: 'hReward', challenges: 'hChal', events: 'hEvent', tasks: 'hTask' };

/* ---------- Formato ---------- */
const fmt = n => { const v = Math.round(Number(n) || 0); return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
const eur = n => Number(n).toLocaleString('es-ES', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoOf(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const daysAgo = iso => (Date.parse(today() + 'T12:00:00') - Date.parse(iso + 'T12:00:00')) / 864e5;
const fdate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : ''); };
const wday = iso => WD[new Date(iso + 'T12:00:00').getDay()];
const LOGO = 'img/logo.png';
const pic = k => k || LOGO;
const thumb = k => `<img class="thumb${k ? '' : ' logo'}" src="${esc(pic(k))}" alt="" loading="lazy">`;
const $ = sel => document.querySelector(sel);
const initial = n => esc((String(n || '?').trim()[0] || '?').toUpperCase());
const avatarHTML = (p, cls) => p && p.avatar ? `<img class="${cls}" src="${esc(p.avatar)}" alt="">` : `<span class="${cls} avatar-ph">${initial(p && p.name)}</span>`;

/* ---------- Estado ---------- */
let session = null, bootedFor = null, D = null;
let tab = 'pasaporte', filter = 'todo', monMsg = null, canjeMsg = null, monAct = null, confirmDel = false, pendingDel = null;
let authMode = 'login', authMsg = null, stats = null, channel = null, scanner = null, shownBalance = null;
const editing = { earn: null, rewards: null, challenges: null, events: null, tasks: null };

async function q(promise) { const { data, error } = await promise; if (error) throw new Error(niceError(error.message)); return data; }
async function rpc(fn, args) { const { data, error } = await sb.rpc(fn, args || {}); if (error) throw new Error(niceError(error.message)); return data; }
function niceError(m) {
  m = String(m || 'Algo ha fallado');
  const map = [
    [/Invalid login credentials/i, 'Email o contraseña incorrectos.'],
    [/Email not confirmed/i, 'Todavía no has confirmado tu email. Revisa tu correo (y la carpeta de spam).'],
    [/User already registered/i, 'Ya hay una cuenta con ese email. Prueba a entrar.'],
    [/Password should be at least/i, 'La contraseña tiene que tener al menos 8 caracteres.'],
    [/Unable to validate email address/i, 'Ese email no parece válido.'],
    [/rate limit/i, 'Demasiados intentos seguidos. Espera un poco y vuelve a probar.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'No hay conexión. Comprueba tu internet y vuelve a probar.'],
    [/JWT expired/i, 'Tu sesión ha caducado. Vuelve a entrar.']
  ];
  for (const [re, t] of map) if (re.test(m)) return t;
  return m;
}

/* ---------- Reglas (igual que en la base de datos) ---------- */
const me = () => D.me;
const levels = () => D.settings.levels;
const actsYear = () => D.scans.filter(s => s.counts && daysAgo(s.day) < 365).length;
function levelIdx() {
  const n = actsYear(); let i = 0;
  levels().forEach((l, k) => { if (n >= l.min) i = k; });
  const p = me();
  if (p.level_floor_idx != null && p.level_floor_until >= today()) i = Math.max(i, Math.min(p.level_floor_idx, levels().length - 1));
  return i;
}
const earnValue = e => Math.round((Number(e.price) * 100 + e.bonus) * (1 + (levels()[levelIdx()].mult || 0) / 100));
const expiry = () => addDays(D.lastPos, 365);
const upcoming = () => D.events.filter(v => v.day >= today());
const isStaff = () => D && me().role === 'staff';
const isAdmin = () => isStaff() && !!me().admin;
const earnById = id => D.earn.find(e => e.id === id);

/* =====================================================================
   Arranque y sesión
   ===================================================================== */
async function start() {
  if (!CONFIGURED) return renderSetup();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('offline', () => offlineBar(true));
  window.addEventListener('online', () => offlineBar(false));
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((ev, s) => {
    setTimeout(() => {
      if (ev === 'PASSWORD_RECOVERY') { session = s; showNewPassword(); return; }
      session = s;
      if (ev === 'SIGNED_OUT' || !s) { D = null; bootedFor = null; unsubscribe(); renderAuth(); }
      else if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') boot();
    }, 0);
  });
  if (session) boot(); else renderAuth();
}

function offlineBar(on) {
  let b = $('#offlineBar');
  if (on && !b) { b = document.createElement('div'); b.id = 'offlineBar'; b.className = 'offline'; b.textContent = 'Sin conexión. Lo que hagas se verá al volver la cobertura.'; document.body.appendChild(b); }
  if (!on && b) b.remove();
}

async function boot() {
  if (!session) return;
  const uid = session.user.id;
  if (bootedFor === uid) return;
  bootedFor = uid;
  $('#root').innerHTML = '<div class="loading"><div class="spinner"></div><div>Abriendo el refugio…</div></div>';
  try {
    const exp = await rpc('check_my_expiry');
    const bday = await rpc('claim_birthday');
    await load();
    $('#root').innerHTML = $('#tplApp').innerHTML;
    tab = 'pasaporte';
    render();
    if (exp && exp.expired) toast('Huellas caducadas', 'Han pasado 12 meses sin actividad', true);
    if (bday && bday.bonus) celebrate({ kind: 'cumple', title: '¡Feliz cumpleaños!', big: '+' + fmt(bday.bonus), name: 'Huellas de regalo', sub: 'Celébralo con una aventura con nosotros.' });
    if (!me().onboarded) showWelcome(0);
    subscribe();
  } catch (e) {
    bootedFor = null;
    $('#root').innerHTML = `<div class="setup card"><h2>No se ha podido abrir el refugio</h2><p class="muted">${esc(e.message)}</p>
      <div class="row-btns"><button class="btn ghost" id="outBtn">Cerrar sesión</button><button class="btn" id="retryBtn">Reintentar</button></div></div>`;
    $('#retryBtn').onclick = () => boot();
    $('#outBtn').onclick = () => sb.auth.signOut();
  }
}

async function load() {
  const uid = session.user.id, t = today();
  const [prof, settings, earn, rewards, challenges, events, moves, lastPos, reds, progress, scans] = await Promise.all([
    q(sb.from('profiles').select('*').eq('id', uid).single()),
    q(sb.from('settings').select('*').eq('id', 1).single()),
    q(sb.from('earn_items').select('*').order('sort').order('created_at')),
    q(sb.from('rewards').select('*').eq('active', true).order('cost')),
    q(sb.from('challenges').select('*').order('sort').order('created_at')),
    q(sb.from('events').select('*').gte('day', addDays(t, -30)).order('day').order('start_time')),
    q(sb.from('movements').select('id,text,amount,day').eq('user_id', uid).order('id', { ascending: false }).limit(15)),
    q(sb.from('movements').select('day').eq('user_id', uid).gt('amount', 0).order('day', { ascending: false }).limit(1)),
    q(sb.from('redemptions').select('*').eq('user_id', uid).order('id', { ascending: false })),
    q(sb.from('challenge_progress').select('challenge_id,progress').eq('user_id', uid)),
    q(sb.from('scans').select('day,counts').eq('user_id', uid).gte('day', addDays(t, -366)))
  ]);
  D = {
    me: prof, settings, earn, rewards, challenges, events, moves, reds, scans,
    lastPos: (lastPos[0] && lastPos[0].day) || prof.since,
    progress: Object.fromEntries(progress.map(p => [p.challenge_id, p.progress])),
    tasks: prof.role === 'staff' ? await q(sb.from('tasks').select('*').gte('day', addDays(t, -7)).order('day').order('start_time')) : []
  };
  if (!monAct || !earnById(monAct)) { const f = D.earn.find(e => e.kind !== 'comunidad'); monAct = f ? f.id : null; }
}

/* ---------- Avisos en directo cuando el monitor te suma Huellas ---------- */
let pendingMoves = [], moveTimer = null;
function subscribe() {
  unsubscribe();
  channel = sb.channel('mis-huellas-' + session.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movements', filter: 'user_id=eq.' + session.user.id },
      p => { pendingMoves.push(p.new); clearTimeout(moveTimer); moveTimer = setTimeout(flushMoves, 800); })
    .subscribe();
}
function unsubscribe() { if (channel) { sb.removeChannel(channel); channel = null; } }
async function flushMoves() {
  const ms = pendingMoves.splice(0);
  if (!D || !ms.length) return;
  const before = { total: me().total, level: levelIdx() };
  try { await load(); } catch (e) { return; }
  render();
  const won = ms.filter(m => m.amount > 0 && !/^Reto: /.test(m.text) && m.text !== 'Regalo de cumpleaños');
  if (won.length) toast('+' + fmt(won.reduce((s, m) => s + m.amount, 0)), won.map(m => m.text).join(' · '));
  celebrateDiff(before, ms);
}
function celebrateDiff(before, ms) {
  BADGES.filter(b => before.total < b.need && me().total >= b.need).forEach(b =>
    celebrate({ kind: 'sello', title: '¡Nuevo sello de supervivencia!', big: b.ch, name: b.name, sub: `${b.need} salida${b.need > 1 ? 's' : ''} con The Wild Side. Ya tienes ${BADGES.filter(x => me().total >= x.need).length} de ${BADGES.length}.` }));
  ms.filter(m => /^Reto: /.test(m.text)).forEach(m =>
    celebrate({ kind: 'reto', title: '¡Reto completado!', big: '+' + fmt(m.amount), name: m.text.replace(/^Reto: /, ''), sub: 'Huellas extra sumadas a tu saldo.' }));
  const after = levelIdx();
  if (after > before.level) celebrate({ kind: 'nivel', title: '¡Subes de nivel!', big: levels()[after].name, name: 'Ahora eres ' + levels()[after].name, sub: levels()[after].perk });
}

/* =====================================================================
   Pantallas sin sesión
   ===================================================================== */
function renderSetup() {
  $('#root').innerHTML = `<div class="setup card"><h2>Falta conectar Supabase</h2>
    <p>Abre el archivo <code>config.js</code> y pega la <b>Project URL</b> y la clave <b>anon public</b> de tu proyecto de Supabase
    (las encuentras en Supabase › Project Settings › API).</p>
    <p class="muted">La guía <code>LEEME.md</code> explica todos los pasos.</p></div>`;
}

function renderAuth() {
  const login = authMode === 'login', signup = authMode === 'signup', forgot = authMode === 'forgot';
  $('#root').innerHTML = `<div class="auth">
    <div class="auth-head"><img src="${LOGO}" alt="Logo de The Wild Side"><div class="brand">Wild Pass</div>
      <div class="sub">Únete al refugio de The Wild Side: gana Huellas en cada aventura y canjéalas por premios.</div></div>
    ${forgot ? '' : `<div class="seg"><button class="${login ? 'on' : ''}" data-auth="login">Entrar</button><button class="${signup ? 'on' : ''}" data-auth="signup">Unirme</button></div>`}
    <form class="card" id="fAuth" novalidate>
      ${forgot ? '<h2 style="margin:0">Recuperar contraseña</h2><div class="hint" style="margin:0">Te enviamos un email con un enlace para poner una nueva.</div>' : ''}
      ${signup ? '<label for="aName">Nombre<input id="aName" autocomplete="name" required maxlength="60" placeholder="Cómo quieres que te llamemos"></label>' : ''}
      <label for="aEmail">Email<input id="aEmail" type="email" autocomplete="email" required placeholder="tu@email.com"></label>
      ${forgot ? '' : `<label for="aPass">Contraseña${pwBox(`<input id="aPass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="8" placeholder="${signup ? 'Mínimo 8 caracteres' : ''}">`)}</label>`}
      ${signup ? `<label class="check" for="aAge"><input type="checkbox" id="aAge"> <span>Tengo 14 años o más</span></label>
        <div class="hint" style="margin-top:-6px">Si tienes menos, pide a tu padre, madre o tutor que cree la cuenta.</div>
        <label class="check" for="aLegal"><input type="checkbox" id="aLegal"> <span>Acepto las <a href="legal.html#bases" target="_blank" rel="noopener">bases del programa</a> y la <a href="legal.html#privacidad" target="_blank" rel="noopener">política de privacidad</a></span></label>` : ''}
      ${authMsg ? `<div class="${authMsg.ok ? 'form-ok' : 'form-err'}" role="status">${esc(authMsg.t)}</div>` : ''}
      <button class="btn">${login ? 'Entrar' : signup ? 'Unirme al refugio' : 'Enviar enlace'}</button>
      ${login ? '<button type="button" class="link-small" data-auth="forgot">¿Has olvidado la contraseña?</button>' : ''}
      ${forgot ? '<button type="button" class="link-small" data-auth="login">Volver a entrar</button>' : ''}
    </form></div>`;
}

async function submitAuth(f) {
  const email = $('#aEmail').value.trim(), pass = $('#aPass') ? $('#aPass').value : '';
  const btn = f.querySelector('.btn'); btn.disabled = true;
  authMsg = null;
  try {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Escribe un email válido.');
    if (authMode === 'login') {
      await q(sb.auth.signInWithPassword({ email, password: pass }));
      return;
    }
    if (authMode === 'forgot') {
      await q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
      authMsg = { ok: true, t: 'Si hay una cuenta con ese email, te hemos enviado un enlace. Revisa también el spam.' };
      return renderAuth();
    }
    const name = $('#aName').value.trim();
    if (!name) throw new Error('Escribe tu nombre.');
    if (pass.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
    if (!$('#aAge').checked) throw new Error('Para registrarte tienes que tener 14 años o más. Si no, que cree la cuenta un adulto.');
    if (!$('#aLegal').checked) throw new Error('Tienes que aceptar las bases y la política de privacidad.');
    const data = await q(sb.auth.signUp({ email, password: pass, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } }));
    if (!data.session) { authMsg = { ok: true, t: 'Te hemos enviado un email para confirmar tu cuenta. Ábrelo y vuelve aquí para entrar.' }; authMode = 'login'; return renderAuth(); }
  } catch (e) {
    authMsg = { ok: false, t: e.message };
    renderAuth();
    const em = $('#aEmail'); if (em) em.value = email;
  }
}

function showNewPassword() {
  $('#sheetHost').innerHTML = `<div class="sheet"><form class="box" id="fNewPass" role="dialog" aria-label="Nueva contraseña">
    <div style="font-family:var(--display);font-size:22px">Nueva contraseña</div>
    <label for="npPass">Contraseña nueva${pwBox('<input id="npPass" type="password" minlength="8" required autocomplete="new-password" placeholder="Mínimo 8 caracteres">')}</label>
    <button class="btn">Guardar contraseña</button></form></div>`;
}

/* =====================================================================
   App con sesión
   ===================================================================== */
const ICONS = {
  pasaporte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/></svg>',
  ganar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/></svg>',
  premios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8s-2-5-5-4 0 4 5 4zm0 0s2-5 5-4 0 4-5 4z"/></svg>',
  retos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20l6-12 4 7 3-4 5 9z"/><path d="M9 8V3l4 2-4 2"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/></svg>'
};
const PROFILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
const tabs = () => [['pasaporte', 'Refugio'], ['ganar', 'Ganar'], ['premios', 'Premios'], ['retos', 'Retos']].concat(isStaff() ? [['admin', 'Equipo']] : []);

function render() {
  if (!D || !$('#view')) return;
  const ts = tabs();
  $('#nav').style.gridTemplateColumns = `repeat(${ts.length},1fr)`;
  $('#nav').innerHTML = ts.map(([id, l]) => `<button class="${tab === id ? 'on' : ''}" data-tab="${id}" aria-current="${tab === id}">${ICONS[id]}<span>${l}</span></button>`).join('');
  $('#modePill').hidden = tab !== 'admin';
  $('#modePill').textContent = isAdmin() ? 'Modo jefe' : 'Equipo';
  $('#profBtn').classList.toggle('on', tab === 'perfil');
  $('#profBtn').innerHTML = me().avatar ? `<img src="${esc(me().avatar)}" alt="">` : PROFILE_ICON;
  const views = { pasaporte: vPasaporte, ganar: vGanar, premios: vPremios, retos: vRetos, admin: vAdmin, perfil: vPerfil };
  $('#view').innerHTML = (views[tab] || vPasaporte)();
  if (tab === 'pasaporte') animateBalance();
}

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/></svg>';
const pwBox = input => `<span class="pw">${input}<button type="button" class="pw-eye" data-pw="1" aria-label="Ver contraseña" aria-pressed="false">${EYE}</button></span>`;

function evCard(v) {
  const e = earnById(v.earn_id) || { name: 'Actividad', price: 0, bonus: 0 };
  const left = Math.max(0, v.spots - v.taken), [, m, d] = v.day.split('-').map(Number), open = v.spots >= 999;
  const st = open ? '<span class="spots">Entrada libre</span>' : left <= 0 ? '<span class="spots full">Completo</span>' : left <= 5 ? `<span class="spots few">Últimas ${left} plaza${left > 1 ? 's' : ''}</span>` : `<span class="spots">${left} plazas libres</span>`;
  const im = v.img || e.img;
  return `<div class="event"><div class="ev-date${im ? ' pic' : ''}">${im ? `<img src="${esc(im)}" alt="">` : ''}<b>${d}</b><span>${MONTHS[m - 1]}</span></div>
    <div class="info"><div class="t">${esc(v.title || e.name)}</div><div class="d">${wday(v.day)} · ${esc(v.start_time)} · ${esc(v.place)}</div>
    <div class="ev-meta">${st}<span class="cost">+${fmt(earnValue(e))}</span></div></div>
    <button class="btn small" data-book="${esc(v.id)}" ${!open && left <= 0 ? 'disabled' : ''}>${open ? 'Info' : left <= 0 ? 'Completo' : 'Reservar'}</button></div>`;
}

function nextReward() {
  const li = levelIdx();
  return D.rewards.filter(r => r.min_level <= li && r.cost > me().balance).sort((a, b) => a.cost - b.cost)[0];
}

function vPasaporte() {
  const p = me(), li = levelIdx(), L = levels()[li], N = levels()[li + 1], a = actsYear();
  const pct = N ? Math.max(0, Math.min(100, (a - L.min) / Math.max(1, N.min - L.min) * 100)) : 100;
  const nr = nextReward(), aff = D.rewards.filter(r => r.min_level <= li && r.cost <= p.balance).length;
  const nrPct = nr ? Math.min(100, p.balance / nr.cost * 100) : 100;
  const pend = D.reds.filter(r => !r.used).length;
  const got = BADGES.filter(b => p.total >= b.need).length;
  const up = upcoming(), bonusBday = D.settings.birthday_bonus;
  return `
  <section class="pass">
    <div class="who"><span class="name">${esc(p.name)}</span><span class="tier-chip">${esc(L.name)}</span></div>
    <div class="balance"><div class="label">Tus Huellas</div><div class="value"><span class="n">${fmt(p.balance)}</span><small>Huellas</small></div></div>
    <div class="progress-row"><span>${N ? `<b class="num">${Math.max(0, N.min - a)}</b> actividad${N.min - a !== 1 ? 'es' : ''} para <b>${esc(N.name)}</b>` : 'Nivel máximo alcanzado'}</span><span class="num" style="opacity:.9">${a} en 12 meses</span></div>
    <div class="bar hz"><i style="width:${pct}%"></i></div>
    <div class="muted" style="font-size:13px;margin-top:8px">${esc(L.perk)}</div>
    <button class="btn qr-btn" data-myqr="1">${ICONS.ganar}<span>Mostrar mi QR</span></button>
  </section>
  ${pend ? `<button class="pending-bar" data-tab="premios"><span>Tienes <b>${pend}</b> premio${pend > 1 ? 's' : ''} por recoger</span><span>Ver código</span></button>` : ''}
  ${up.length ? `<h3>Tu próxima aventura</h3><div class="stack">${evCard(up[0])}</div>${up.length > 1 ? `<button class="link-btn" data-tab="ganar">Ver las ${up.length} próximas aventuras</button>` : ''}` : ''}
  ${!p.birth ? `<div class="bday-prompt"><span><b>¿Cuándo es tu cumpleaños?</b> Ese día te regalamos ${fmt(bonusBday)} Huellas.</span><button class="btn small" data-tab="perfil">Añadir</button></div>` : ''}
  <h3>Tu próximo premio</h3>
  <div class="card">
    ${nr ? `<div class="next-reward">${thumb(nr.img)}<div class="body"><div style="font-weight:700">${esc(nr.name)}</div>
      <div class="muted" style="font-size:13px">Te faltan <span class="num" style="color:inherit;font-weight:700">${fmt(nr.cost - p.balance)}</span> Huellas</div>
      <div class="bar"><i style="width:${nrPct}%"></i></div></div></div>` : '<div>Ya puedes canjear todo lo disponible para tu nivel.</div>'}
    ${aff ? `<div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="muted" style="font-size:13px">Tienes <b style="color:var(--green-ink)">${aff}</b> premio${aff > 1 ? 's' : ''} listo${aff > 1 ? 's' : ''} para canjear</span><button class="btn small" data-tab="premios">Ver premios</button></div>` : ''}
  </div>
  <h3>Sellos de supervivencia · ${got} de ${BADGES.length}</h3>
  <div class="badges">${BADGES.map(b => `<div class="badge ${p.total >= b.need ? 'on' : ''}"><div class="seal">${b.ch}</div>${esc(b.name)}<small>${b.need} salida${b.need > 1 ? 's' : ''}</small></div>`).join('')}</div>
  <h3>Movimientos</h3>
  <div class="card">${D.moves.length ? `<ul class="log">${D.moves.map(l => `<li><span class="lt"><span>${esc(l.text)}</span><small>${fdate(l.day)}</small></span><span class="${l.amount >= 0 ? 'plus' : 'minus'}">${l.amount >= 0 ? '+' : '−'}${fmt(Math.abs(l.amount))}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Aún no tienes movimientos. Enseña tu QR al monitor en tu próxima aventura.</p>'}
    ${p.balance > 0 ? `<p class="muted" style="font-size:12.5px;margin:10px 0 0">Tus Huellas caducan el <b>${fdate(expiry())}</b> si no vuelves antes. Cada actividad reinicia el plazo.</p>` : ''}
  </div>`;
}

function vGanar() {
  const kinds = ['todo', ...Object.keys(KINDS)];
  const list = D.earn.filter(e => filter === 'todo' || e.kind === filter);
  const up = upcoming();
  return `<h2>Próximas aventuras</h2>
  <div class="stack">${up.length ? up.map(evCard).join('') : '<p class="muted">No hay fechas programadas ahora mismo. ¡Vuelve pronto!</p>'}</div>
  <h2 style="margin-top:26px">Gana Huellas</h2>
  <p class="muted" style="margin-top:-4px">100 Huellas por cada euro, más bonus por venir. Enseña tu QR al monitor y te las suma al momento.</p>
  <div class="seg">${kinds.map(k => `<button class="${filter === k ? 'on' : ''}" data-filter="${k}">${k === 'todo' ? 'Todo' : KINDS[k]}</button>`).join('')}</div>
  <div class="stack" style="margin-top:10px">${list.map(e => `<div class="item">${thumb(e.img)}<div class="info"><div class="t">${esc(e.name)}</div>
    <div class="d"><span class="tag">${KINDS[e.kind] || esc(e.kind)}</span><span class="nw">${Number(e.price) ? eur(e.price) : ''}${Number(e.price) && e.bonus ? ' · ' : ''}${e.bonus ? `bonus ${fmt(e.bonus)}` : ''}</span></div>${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</div>
    <span class="cost">+${fmt(earnValue(e))}</span></div>`).join('') || '<p class="muted">No hay nada en esta categoría todavía.</p>'}</div>`;
}

function vPremios() {
  const li = levelIdx(), p = me();
  const pend = D.reds.filter(r => !r.used), done = D.reds.filter(r => r.used).slice(0, 10);
  return `<h2>Canjea tus Huellas</h2>
  <p class="muted" style="margin-top:-4px">Tienes <b class="num" style="color:var(--green-ink)">${fmt(p.balance)}</b> Huellas. Algunos premios se desbloquean al subir de nivel.</p>
  ${D.reds.length ? `<h3>Mis premios</h3><div class="stack">
    ${pend.map(r => `<div class="item mine"><div class="info"><div class="t">${esc(r.name)}</div><div class="d">${r.coupon ? 'Regalo de bienvenida · enséñaselo al monitor en tu primera actividad' : `Canjeado el ${fdate(r.created_day)} · enséñale este código al monitor o en la tienda`}</div></div><span class="code-sm">${esc(r.code)}</span></div>`).join('')}
    ${done.map(r => `<div class="item mine done"><div class="info"><div class="t">${esc(r.name)}</div><div class="d">Recogido el ${fdate(r.used_day || r.created_day)}</div></div><span class="tag">Recogido</span></div>`).join('')}
  </div><h3>Catálogo</h3>` : ''}
  <div class="stack" style="margin-top:10px">${D.rewards.map(r => {
    const locked = r.min_level > li, can = !locked && p.balance >= r.cost;
    return `<div class="item">${thumb(r.img)}<div class="info"><div class="t">${esc(r.name)}</div><div class="d"><span class="tag">${esc(r.cat)}</span>${locked ? `<span class="tag lock">Nivel ${esc((levels()[r.min_level] || {}).name)}</span>` : ''}</div></div>
    <div style="display:grid;gap:6px;justify-items:end"><span class="cost">${fmt(r.cost)}</span><button class="btn small" data-redeem="${esc(r.id)}" ${can ? '' : 'disabled'}>${locked ? 'Bloqueado' : can ? 'Canjear' : 'Faltan ' + fmt(r.cost - p.balance)}</button></div></div>`;
  }).join('') || '<p class="muted">Pronto habrá premios.</p>'}</div>`;
}

function vRetos() {
  const li = levelIdx(), ss = D.settings.season || {};
  const amigo = earnById('amigo');
  return `${ss.title ? `<div class="season">${ss.img ? `<img class="banner" src="${esc(ss.img)}" alt="Cartel de ${esc(ss.title)}">` : ''}<div class="k">${esc(ss.tag)}</div><div class="n">${esc(ss.title)}</div><div class="muted" style="font-size:13px">${esc(ss.text)}</div></div>` : ''}
  <h3>Retos activos</h3>
  <div class="stack">${D.challenges.slice(0, 3).map(c => {
    const pr = Math.min(c.goal, D.progress[c.id] || 0), done = pr >= c.goal;
    return `<div class="card challenge"><div class="top"><b>${esc(c.name)}</b><span class="cost">+${fmt(c.reward)}</span></div>
    <div class="muted" style="font-size:13px">${esc(c.description)}</div>
    <div class="progress-row" style="margin-top:8px"><span class="num">${pr} / ${c.goal}</span><span style="color:${done ? 'var(--green-ink)' : 'var(--muted)'};font-weight:600">${done ? 'Completado' : 'En curso'}</span></div>
    <div class="bar"><i style="width:${pr / c.goal * 100}%"></i></div></div>`;
  }).join('') || '<p class="muted">Pronto habrá retos nuevos.</p>'}</div>
  ${amigo ? `<h3>Invita a tu manada</h3>
  <div class="card stack">
    <div>Pásale tu código a un amigo. Cuando haga su primera actividad y se lo diga al monitor, tú ganas <b>${fmt(earnValue(amigo))} Huellas</b>.</div>
    <div class="invite"><span class="num sel">${esc(me().code)}</span><button class="btn small" data-copy="Ven a probar The Wild Side. Dile al monitor mi código ${esc(me().code)} en tu primera actividad.">Copiar invitación</button></div>
  </div>` : ''}
  <h3>Niveles</h3>
  <div class="tiers" style="grid-template-columns:repeat(${levels().length},1fr)">${levels().map((l, i) => `<div class="${i === li ? 'on' : ''}"><b>${esc(l.name)}</b>${l.min} act.<br>+${l.mult}%</div>`).join('')}</div>
  <p class="muted" style="font-size:13px">Los niveles se calculan con las actividades y eventos de los últimos 12 meses.</p>`;
}

function vPerfil() {
  const p = me(), s = D.settings;
  return `<h2>Mi perfil</h2>
  <div class="card avatar-row">
    ${avatarHTML(p, 'avatar-lg')}
    <div class="stack" style="gap:8px;min-width:0">
      <b>Tu foto</b>
      <span class="muted" style="font-size:13px">La verá el monitor al escanear tu QR, para comprobar que eres tú.</span>
      <div class="row-btns" style="justify-content:flex-start"><button class="btn small" data-avatar="pick">${p.avatar ? 'Cambiar foto' : 'Poner foto'}</button>${p.avatar ? '<button class="btn small ghost" data-avatar="remove">Quitar</button>' : ''}</div>
    </div>
    <input type="file" id="avatarIn" accept="image/*" hidden>
  </div>
  <form class="adm card" id="fPerfil" style="margin-top:12px">
    <label for="pName">Nombre<input id="pName" value="${esc(p.name)}" required maxlength="60"></label>
    <div class="kv"><span>Email</span><b>${esc(p.email)}</b></div>
    ${p.birth ? `<div class="kv"><span>Fecha de nacimiento</span><b>${fdate(p.birth)}</b></div>
    <div class="hint">Ya no se puede cambiar desde la app. Si te equivocaste, habla con ${esc(s.contact_name)}.</div>`
    : `<label for="pBirth">Fecha de nacimiento<input id="pBirth" type="date" max="${today()}"></label>
    <div class="hint">El día de tu cumpleaños te regalamos ${fmt(s.birthday_bonus)} Huellas. Revísala bien: solo se puede poner una vez.</div>`}
    <div class="kv"><span>Número de socio</span><b class="num sel">${esc(p.code)}</b></div>
    <div class="kv"><span>Socio desde</span><b>${fdate(p.since)}</b></div>
    <div class="kv"><span>Salidas en total</span><b class="num">${p.total}</b></div>
    <div class="row-btns"><button class="btn">Guardar cambios</button></div>
  </form>
  <h3>Contacto</h3>
  <div class="card stack">
    <div class="kv"><span>Teléfono (${esc(s.contact_name)})</span><b class="num sel">${esc(s.contact_phone)}</b></div>
    <div class="kv"><span>Email</span><b class="sel">${esc(s.contact_email)}</b></div>
    <div class="row-btns"><button class="btn small ghost" data-copy="${esc(s.contact_phone.replace(/\s/g, ''))}">Copiar teléfono</button><button class="btn small ghost" data-copy="${esc(s.contact_email)}">Copiar email</button></div>
  </div>
  <h3>Bases y privacidad</h3>
  <div class="card stack">
    <ul class="rules">
      <li>Ganas 100 Huellas por cada euro, más bonus por venir a actividades y eventos.</li>
      <li>Las Huellas no son dinero: no se cambian por efectivo ni se pueden traspasar.</li>
      <li>Caducan si pasas 12 meses sin ninguna actividad.</li>
      <li>Tu nivel se calcula con las actividades de los últimos 12 meses.</li>
      <li>En tu cumpleaños te regalamos ${fmt(s.birthday_bonus)} Huellas, una vez al año. La fecha de nacimiento solo se puede poner una vez.</li>
    </ul>
    <div class="row-btns"><a class="btn small ghost" href="legal.html#bases" target="_blank" rel="noopener">Bases completas</a><a class="btn small ghost" href="legal.html#privacidad" target="_blank" rel="noopener">Privacidad</a></div>
  </div>
  <h3>Cuenta</h3>
  <div class="stack">
    <button class="btn ghost" data-welcome="1">Ver la bienvenida otra vez</button>
    <button class="btn ghost" data-logout="1">Cerrar sesión</button>
    ${confirmDel ? `<div class="card stack"><b>¿Borrar tu cuenta?</b><span class="muted" style="font-size:13px">Se borrarán tu cuenta, tus Huellas, tus sellos y tus premios sin recoger. No se puede deshacer.</span><div class="row-btns"><button class="btn ghost small" data-delacc="no">Cancelar</button><button class="btn warn small" data-delacc="yes">Sí, borrar mi cuenta</button></div></div>`
      : '<button class="btn warn" data-delacc="ask">Borrar mi cuenta</button>'}
  </div>`;
}

/* ---------- Trabajos del equipo ---------- */
let assignTo = null, rkYear = new Date().getFullYear(), ranking = null;
function taskItem(t, admin) {
  const v = t.event_id && D.events.find(x => x.id === t.event_id);
  const late = !t.done && t.day < today();
  const when = `${wday(t.day)} ${fdate(t.day)}${t.start_time ? ' · ' + esc(t.start_time) : ''}${t.place ? ' · ' + esc(t.place) : ''}`;
  return `<div class="item task${t.done ? ' done' : ''}">
    <div class="info"><div class="t">${esc(t.title)}</div>
      <div class="d">${when}${late ? ' · <b class="late">sin hacer</b>' : ''}</div>
      ${v ? `<div class="d">Para: ${esc(v.title || (earnById(v.earn_id) || {}).name || '')}</div>` : ''}
      ${t.notes ? `<div class="note">${esc(t.notes)}</div>` : ''}</div>
    <div class="acts">${admin ? `<button class="btn small${t.done ? ' ghost' : ''}" data-task="${esc(t.id)}" data-done="${t.done ? 0 : 1}" aria-pressed="${t.done}">${t.done ? '✓ Hecho' : 'Hecho'}</button><button class="btn small ghost" data-edit="tasks:${esc(t.id)}">Editar</button><button class="btn small warn" data-del="tasks:${esc(t.id)}">${pendingDel === 'tasks:' + t.id ? '¿Seguro?' : 'Quitar'}</button>`
      : `<button class="btn small${t.done ? ' ghost' : ''}" data-task="${esc(t.id)}" data-done="${t.done ? 0 : 1}" aria-pressed="${t.done}">${t.done ? '✓ Hecho' : 'Marcar hecho'}</button>`}</div>
  </div>`;
}

const PUESTOS = ['Monitor', 'Monitora', 'Guía de montaña', 'Creador de contenido', 'Creadora de contenido', 'Coordinación'];
const puesto = m => m.position || (m.admin ? 'Jefe' : 'Monitor');
function askPuesto(id) {
  const m = (D.team || []).find(x => x.id === id); if (!m) return;
  sheet(`<div style="font-family:var(--display);font-size:22px">Puesto de ${esc(m.name)}</div>
    <div class="muted">Es solo el nombre que se ve en el equipo. Lo que puede hacer en la app no cambia.</div>
    <div class="chips">${PUESTOS.map(p => `<button type="button" class="chip" data-pick="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <label for="pPuesto">Puesto<input id="pPuesto" maxlength="40" value="${esc(m.position)}" placeholder="${m.admin ? 'Jefe' : 'Monitor'}"></label>
    <div class="row-btns"><button class="btn ghost" data-close="1">Cancelar</button><button class="btn" id="okPuesto">Guardar</button></div>`);
  document.querySelectorAll('[data-pick]').forEach(c => c.onclick = () => { $('#pPuesto').value = c.dataset.pick; });
  $('#okPuesto').onclick = async () => {
    $('#okPuesto').disabled = true;
    try { const r = await rpc('admin_set_position', { p_id: id, p_position: $('#pPuesto').value }); closeSheet(); await openAdmin(); toast('Guardado', `${m.name}: ${r || puesto({ admin: m.admin })}`); }
    catch (e) { $('#okPuesto').disabled = false; toast('No se ha podido guardar', e.message, true); }
  };
}

async function showLog(id) {
  const m = (D.team || []).find(x => x.id === id); if (!m) return;
  const d0 = rkYear + '-01-01', d1 = (rkYear + 1) + '-01-01';
  sheet(`<div style="font-family:var(--display);font-size:22px">${esc(m.name)} · ${rkYear}</div><div class="hint" style="margin:0">Cargando…</div>`);
  try {
    const [ls, ts] = await Promise.all([
      q(sb.from('staff_log').select('*').eq('user_id', id).gte('day', d0).lt('day', d1).order('day', { ascending: false })),
      q(sb.from('tasks').select('*').eq('assigned_to', id).eq('done', true).gte('day', d0).lt('day', d1).order('day', { ascending: false }))
    ]);
    const all = ls.map(l => ({ day: l.day, t: l.activity, n: l.notes, k: 'Participación', id: l.id }))
      .concat(ts.map(x => ({ day: x.day, t: x.title, n: x.notes, k: 'Trabajo hecho' }))).sort((a, b) => a.day < b.day ? 1 : -1);
    sheet(`<div style="font-family:var(--display);font-size:22px">${esc(m.name)} · ${rkYear}</div>
      <div class="muted">${esc(puesto(m))} · ${all.length} participacion${all.length === 1 ? '' : 'es'}</div>
      <ul class="log">${all.map(r => `<li><span class="lt"><span>${esc(r.t)}</span><small>${wday(r.day)} ${fdate(r.day)} · ${r.k}${r.n ? ' · ' + esc(r.n) : ''}</small></span>${r.id ? `<button class="btn small warn" data-unlog="${r.id}" data-who="${esc(id)}">Quitar</button>` : ''}</li>`).join('') || '<li class="muted">Todavía no hay nada apuntado este año.</li>'}</ul>
      <button class="btn" data-close="1">Cerrar</button>`);
  } catch (e) { closeSheet(); toast('No se ha podido cargar', e.message, true); }
}

/* ---------- Panel del equipo ---------- */
function vAdmin() {
  if (!isStaff()) return '<p class="muted">Esta zona es solo para el equipo.</p>';
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  const delBtn = (t, id) => `<button class="btn small warn" data-del="${t}:${esc(id)}">${pendingDel === t + ':' + id ? '¿Seguro?' : 'Quitar'}</button>`;
  const editBtn = (t, id) => `<button class="btn small ghost" data-edit="${t}:${esc(id)}">Editar</button>`;
  const eE = editing.earn && earnById(editing.earn);
  const eR = editing.rewards && D.adminRewards && D.adminRewards.find(x => x.id === editing.rewards);
  const eC = editing.challenges && D.challenges.find(x => x.id === editing.challenges);
  const eV = editing.events && D.events.find(x => x.id === editing.events);
  const acts = D.earn.filter(e => e.kind !== 'comunidad');
  const s = D.settings, ss = s.season || {};
  const st = stats;
  const rewardsAll = D.adminRewards || D.rewards;
  const adminTop = `  ${st ? `<div class="stats">
    <div class="stat"><b>${fmt(st.socios)}</b><span>socios</span></div>
    <div class="stat"><b>${fmt(st.activos_30)}</b><span>activos en 30 días</span></div>
    <div class="stat"><b>${fmt(st.repartidas)}</b><span>Huellas repartidas</span></div>
    <div class="stat"><b>${st.repartidas ? Math.round(st.canjeadas / st.repartidas * 100) : 0}%</b><span>Huellas canjeadas</span></div>
    <div class="stat"><b>${fmt(st.pendientes)}</b><span>premios por entregar</span></div>
    <div class="stat"><b style="font-size:15px;font-family:var(--body)">${esc(st.top || '—')}</b><span>lo más popular (90 días)</span></div>
  </div>` : '<div class="hint">Cargando números…</div>'}

  <h3>Copia de seguridad</h3>
  <div class="card stack">
    <div class="hint" style="margin:0">El plan gratuito de Supabase no guarda copias automáticas. Descarga los datos al menos una vez al mes y guárdalos en un sitio seguro: contienen datos personales de tus clientes.</div>
    <div class="row-btns" style="justify-content:flex-start">
      <button class="btn small" data-export="socios">Socios y saldos</button>
      <button class="btn small ghost" data-export="movimientos">Movimientos</button>
      <button class="btn small ghost" data-export="canjes">Canjes</button>
    </div>
  </div>
`;
  const monitorPart = `  <h3>Registrar asistencia</h3>
  <form class="adm card" id="fMon">
    <label for="mAct">Actividad de hoy<select id="mAct">${acts.map(e => opt(e.id, monAct, e.name)).join('')}</select></label>
    <button type="button" class="btn cam-btn" data-cam="mon">${ICONS.cam}<span>Escanear QR con la cámara</span></button>
    <label for="mCode">O escribe el código<input id="mCode" placeholder="WS-XXXXX" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"></label>
    <label for="mInv">¿Le ha invitado alguien? (opcional)<input id="mInv" placeholder="Código de quien le invitó" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"></label>
    <div class="hint">La invitación solo cuenta en la primera actividad del cliente.</div>
    <button class="btn ghost">Sumar Huellas con el código escrito</button>
    ${monMsg ? `<div class="mon-msg ${monMsg.ok ? 'ok' : 'err'}" role="status">${monMsg.ok ? `<div class="mon-who">${avatarHTML({ avatar: monMsg.img, name: monMsg.name }, 'avatar-md')}<span>${monMsg.img ? 'Comprueba que es la persona de la foto.' : 'Este cliente no tiene foto.'}</span></div>` : ''}${esc(monMsg.t)}</div>` : ''}
  </form>

  <h3>Entregar un premio</h3>
  <form class="adm card" id="fCanje">
    <button type="button" class="btn cam-btn" data-cam="canje">${ICONS.cam}<span>Escanear código de canje</span></button>
    <label for="cjCode">O escribe el código<input id="cjCode" placeholder="WS-XXXX" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"></label>
    <button class="btn ghost">Validar y entregar</button>
    ${canjeMsg ? `<div class="mon-msg ${canjeMsg.ok ? 'ok' : 'err'}" role="status">${esc(canjeMsg.t)}</div>` : ''}
  </form>
`;
  const adminRest = `  <h3 id="hEvent">${eV ? 'Editar fecha' : 'Agenda: añadir una fecha'}</h3>
  <form class="adm card${eV ? ' editing' : ''}" id="fEvent">
    <label for="vEarn">Actividad<select id="vEarn">${acts.map(e => opt(e.id, eV ? eV.earn_id : '', e.name)).join('')}</select></label>
    <label for="vTitle">Título (opcional)<input id="vTitle" placeholder="Ej.: Ruta nocturna de luna llena" value="${esc(eV ? eV.title : '')}"></label>
    <div class="row2"><label for="vDate">Fecha<input id="vDate" type="date" required value="${esc(eV ? eV.day : '')}"></label>
    <label for="vTime">Hora<input id="vTime" type="time" required value="${esc(eV ? eV.start_time : '10:00')}"></label></div>
    <label for="vPlace">Lugar<input id="vPlace" required placeholder="Ej.: Sierra de Aracena" value="${esc(eV ? eV.place : '')}"></label>
    <div class="row2"><label for="vSpots">Plazas<input id="vSpots" type="number" min="1" value="${eV ? eV.spots : 15}"></label>
    <label for="vTaken">Ya reservadas<input id="vTaken" type="number" min="0" value="${eV ? eV.taken : 0}"></label></div>
    <div class="hint">Para un evento abierto sin reserva (como el pasaje), pon 999 plazas: saldrá como «Entrada libre».</div>
    <label for="vImg">Cartel (opcional${eV && eV.img ? ', ya tiene uno' : ''})<input id="vImg" type="file" accept="image/*"></label>
    <div class="hint">Si no subes cartel, se usa la foto de la actividad.</div>
    <div class="row-btns">${eV ? '<button type="button" class="btn ghost" data-cancel="events">Cancelar</button>' : ''}<button class="btn">${eV ? 'Guardar cambios' : 'Añadir a la agenda'}</button></div>
  </form>
  <div class="stack">${D.events.map(v => `<div class="item${v.day < today() ? ' done' : ''}"><div class="info"><div class="t">${esc(v.title || (earnById(v.earn_id) || {}).name || '')}</div><div class="d">${fdate(v.day)} · ${esc(v.start_time)} · ${v.taken}/${v.spots} plazas${v.day < today() ? ' · ya pasó' : ''}</div></div><div class="acts">${editBtn('events', v.id)}${delBtn('events', v.id)}</div></div>`).join('')}</div>

  <h3>Temporada actual</h3>
  <form class="adm card" id="fSeason">
    <label for="sTag">Etiqueta<input id="sTag" value="${esc(ss.tag)}"></label>
    <label for="sTitle">Título (vacío para no mostrar temporada)<input id="sTitle" value="${esc(ss.title)}"></label>
    <label for="sText">Texto<input id="sText" value="${esc(ss.text)}"></label>
    <label for="sImg">Cartel nuevo (opcional)<input id="sImg" type="file" accept="image/*"></label>
    <div class="row-btns"><button class="btn">Guardar temporada</button></div>
  </form>

  <h3 id="hEarn">${eE ? 'Editar: ' + esc(eE.name) : 'Añadir algo que da Huellas'}</h3>
  <form class="adm card${eE ? ' editing' : ''}" id="fEarn">
    <label for="eName">Nombre<input id="eName" required placeholder="Ej.: Fútbol de choque" value="${esc(eE ? eE.name : '')}"></label>
    <div class="row2"><label for="eKind">Tipo<select id="eKind">${Object.entries(KINDS).map(([k, v]) => opt(k, eE ? eE.kind : 'actividad', v)).join('')}</select></label>
    <label for="ePrice">Precio (€)<input id="ePrice" type="number" min="0" step="0.5" value="${eE ? Number(eE.price) : 0}"></label></div>
    <div class="row2"><label for="eBonus">Bonus en Huellas<input id="eBonus" type="number" min="0" step="100" value="${eE ? eE.bonus : 0}"></label>
    <label for="eCounts">¿Cuenta para nivel y sellos?<select id="eCounts">${opt('1', eE && eE.counts ? '1' : '0', 'Sí')}${opt('0', eE && eE.counts ? '1' : '0', 'No')}</select></label></div>
    <label for="eNote">Nota (opcional)<input id="eNote" placeholder="Ej.: 25 € en grupos de 15 o más" value="${esc(eE && eE.note || '')}"></label>
    <label for="ePhoto">${eE ? 'Cambiar foto (opcional)' : 'Foto (opcional)'}<input id="ePhoto" type="file" accept="image/*"></label>
    <div class="row-btns">${eE ? '<button type="button" class="btn ghost" data-cancel="earn">Cancelar</button>' : ''}<button class="btn">${eE ? 'Guardar cambios' : 'Añadir al catálogo'}</button></div>
  </form>
  <div class="stack">${D.earn.map(e => `<div class="item">${thumb(e.img)}<div class="info"><div class="t">${esc(e.name)}</div><div class="d"><span class="tag">${KINDS[e.kind] || esc(e.kind)}</span><span class="nw">${eur(e.price)} · bonus ${fmt(e.bonus)}</span></div></div><div class="acts">${editBtn('earn', e.id)}${e.id === 'amigo' ? '' : delBtn('earn', e.id)}</div></div>`).join('')}</div>
  <div class="hint" style="margin-top:8px">Quitar una actividad borra también sus retos.</div>

  <h3 id="hReward">${eR ? 'Editar: ' + esc(eR.name) : 'Añadir un premio'}</h3>
  <form class="adm card${eR ? ' editing' : ''}" id="fReward">
    <label for="rName">Premio<input id="rName" required placeholder="Ej.: Sudadera edición limitada" value="${esc(eR ? eR.name : '')}"></label>
    <div class="row2"><label for="rCost">Coste en Huellas<input id="rCost" type="number" min="100" step="100" value="${eR ? eR.cost : 30000}" required></label>
    <label for="rMin">Nivel mínimo<select id="rMin">${levels().map((l, i) => opt(i, eR ? eR.min_level : 0, l.name)).join('')}</select></label></div>
    <label for="rCat">Categoría<select id="rCat">${CATS.map(c => opt(c, eR ? eR.cat : 'Merch', c)).join('')}</select></label>
    <label for="rPhoto">${eR ? 'Cambiar foto (opcional)' : 'Foto (opcional)'}<input id="rPhoto" type="file" accept="image/*"></label>
    <div class="row-btns">${eR ? '<button type="button" class="btn ghost" data-cancel="rewards">Cancelar</button>' : ''}<button class="btn">${eR ? 'Guardar cambios' : 'Añadir premio'}</button></div>
  </form>
  <div class="stack">${rewardsAll.map(r => `<div class="item">${thumb(r.img)}<div class="info"><div class="t">${esc(r.name)}</div><div class="d"><span class="tag">${esc(r.cat)}</span><span class="nw">${fmt(r.cost)} · ${esc((levels()[r.min_level] || {}).name)}</span></div></div><div class="acts">${editBtn('rewards', r.id)}${delBtn('rewards', r.id)}</div></div>`).join('')}</div>

  <h3 id="hChal">${eC ? 'Editar: ' + esc(eC.name) : 'Añadir un reto'}</h3>
  <form class="adm card${eC ? ' editing' : ''}" id="fChal">
    <label for="cName">Nombre del reto<input id="cName" required placeholder="Ej.: Juega todos los puestos del mercadillo" value="${esc(eC ? eC.name : '')}"></label>
    <label for="cDesc">Qué tiene que hacer el cliente<input id="cDesc" required placeholder="Ej.: Completa 3 juegos del mercadillo navideño" value="${esc(eC ? eC.description : '')}"></label>
    <div class="row2"><label for="cTrack">Se completa con<select id="cTrack">${D.earn.map(e => opt(e.id, eC ? eC.track : '', e.name)).join('')}</select></label>
    <label for="cGoal">Veces<input id="cGoal" type="number" min="1" value="${eC ? eC.goal : 1}"></label></div>
    <label for="cReward">Premio en Huellas<input id="cReward" type="number" min="0" step="100" value="${eC ? eC.reward : 3000}"></label>
    <div class="row-btns">${eC ? '<button type="button" class="btn ghost" data-cancel="challenges">Cancelar</button>' : ''}<button class="btn">${eC ? 'Guardar cambios' : 'Añadir reto'}</button></div>
  </form>
  <div class="stack">${D.challenges.map(c => `<div class="item"><div class="info"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.description)} · ${c.goal} ${c.goal > 1 ? 'veces' : 'vez'} · +${fmt(c.reward)}</div></div><div class="acts">${editBtn('challenges', c.id)}${delBtn('challenges', c.id)}</div></div>`).join('')}</div>
  <div class="hint" style="margin-top:8px">El cliente ve los 3 primeros retos de la lista.</div>

  <h3>Niveles</h3>
  <form class="adm card" id="fLevels">
    ${levels().map((l, i) => `<fieldset class="lvl"><legend>Nivel ${i + 1}</legend>
      <div class="row3"><label for="lName${i}">Nombre<input id="lName${i}" value="${esc(l.name)}" required></label>
      <label for="lMin${i}">Salidas<input id="lMin${i}" type="number" min="0" value="${l.min}" ${i === 0 ? 'readonly' : ''}></label>
      <label for="lMult${i}">% extra<input id="lMult${i}" type="number" min="0" max="200" value="${l.mult}"></label></div>
      <label for="lPerk${i}">Ventajas<input id="lPerk${i}" value="${esc(l.perk)}"></label></fieldset>`).join('')}
    <div class="row-btns"><button class="btn">Guardar niveles</button></div>
  </form>

  <h3>Contacto y regalos</h3>
  <form class="adm card" id="fContact">
    <div class="row2"><label for="kName">Nombre de contacto<input id="kName" value="${esc(s.contact_name)}" required></label>
    <label for="kPhone">Teléfono<input id="kPhone" value="${esc(s.contact_phone)}" required></label></div>
    <label for="kEmail">Email<input id="kEmail" type="email" value="${esc(s.contact_email)}" required></label>
    <div class="row2"><label for="kBday">Huellas por cumpleaños<input id="kBday" type="number" min="0" step="500" value="${s.birthday_bonus}"></label>
    <label for="kCoupon">Cupón de bienvenida<input id="kCoupon" value="${esc(s.welcome_coupon)}"></label></div>
    <div class="row-btns"><button class="btn">Guardar</button></div>
  </form>

  <h3>Corregir un cumpleaños</h3>
  <form class="adm card" id="fBirth">
    <div class="row2"><label for="bCode">Código del cliente<input id="bCode" required placeholder="WS-XXXXX" autocomplete="off" style="text-transform:uppercase"></label>
    <label for="bDate">Fecha correcta<input id="bDate" type="date" required max="${today()}"></label></div>
    <div class="row-btns"><button class="btn">Corregir</button></div>
  </form>

  <h3>Añadir o quitar del equipo</h3>
  <form class="adm card" id="fTeam">
    <div class="row2"><label for="tCode">Código del trabajador<input id="tCode" required placeholder="WS-XXXXX" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"></label>
    <label for="tRole">Acceso<select id="tRole"><option value="staff">Hacer monitor</option><option value="client">Quitar del equipo</option></select></label></div>
    <div class="hint">El trabajador se crea antes una cuenta en la app y te da su código (lo ve en su Perfil). Los monitores solo pueden registrar asistencias y entregar premios.</div>
    <div class="row-btns"><button class="btn">Guardar</button></div>
  </form>
`;
  const myTasks = (D.tasks || []).filter(t => t.assigned_to === me().id && (!t.done || t.day >= today()));
  const myTasksHTML = `
  <h3>Mis trabajos</h3>
  <div class="stack">${myTasks.map(t => taskItem(t, false)).join('') || '<div class="hint">No tienes trabajos asignados. ¡Descansa, superviviente!</div>'}</div>`;
  const eT = editing.tasks && (D.tasks || []).find(x => x.id === editing.tasks);
  const team = D.team || [];
  const nextEvents = upcoming();
  const teamPart = `
  <h3>Tu equipo</h3>
  <div class="stack">${team.map(m => {
    const ts = (D.tasks || []).filter(t => t.assigned_to === m.id && (!t.done || t.day >= today()));
    const pend = ts.filter(t => !t.done).length;
    return `<div class="card member">
      <div class="member-head">${avatarHTML(m, 'avatar-md')}<div class="info"><div class="t">${esc(m.name || 'Sin nombre')}</div>
        <div class="d">${esc(puesto(m))} · <span class="num nw">${esc(m.code)}</span></div>
        <div class="d">${pend ? `<b class="pend">${pend} trabajo${pend > 1 ? 's' : ''} pendiente${pend > 1 ? 's' : ''}</b>` : 'Sin trabajos pendientes'}</div></div>
        <div class="acts"><button class="btn small" data-assign="${esc(m.id)}">Asignar</button><button class="btn small ghost" data-puesto="${esc(m.id)}">Puesto</button></div></div>
      ${ts.length ? `<div class="stack task-list">${ts.map(t => taskItem(t, true)).join('')}</div>` : ''}
    </div>`;
  }).join('') || '<div class="hint">Todavía no hay nadie en el equipo.</div>'}</div>

  <h3 id="hTask">${eT ? 'Editar trabajo' : 'Asignar un trabajo'}</h3>
  <form class="adm card${eT ? ' editing' : ''}" id="fTask">
    <label for="kWho">Para<select id="kWho" required>${team.map(m => opt(m.id, eT ? eT.assigned_to : assignTo, (m.name || m.code) + (m.admin ? ' (tú)' : ''))).join('')}</select></label>
    <label for="kEv">Fecha de la agenda (opcional)<select id="kEv"><option value="">Ninguna, es otra cosa</option>${nextEvents.map(v => opt(v.id, eT ? eT.event_id : '', fdate(v.day) + ' · ' + (v.title || (earnById(v.earn_id) || {}).name || ''))).join('')}</select></label>
    <label for="kTitle">Trabajo<input id="kTitle" required maxlength="120" placeholder="Ej.: Guiar la ruta, montar el pasaje, puesto de merch" value="${esc(eT ? eT.title : '')}"></label>
    <div class="row2"><label for="kDay">Fecha<input id="kDay" type="date" required value="${esc(eT ? eT.day : '')}"></label>
    <label for="kTime">Hora<input id="kTime" type="time" value="${esc(eT ? eT.start_time : '')}"></label></div>
    <label for="kPlace">Lugar<input id="kPlace" maxlength="120" placeholder="Ej.: Plaza del Ayuntamiento" value="${esc(eT ? eT.place : '')}"></label>
    <label for="kNotes">Notas (opcional)<textarea id="kNotes" maxlength="500" rows="3" placeholder="Ej.: Lleva el botiquín y las linternas">${esc(eT ? eT.notes : '')}</textarea></label>
    <div class="row-btns">${eT ? '<button type="button" class="btn ghost" data-cancel="tasks">Cancelar</button>' : ''}<button class="btn">${eT ? 'Guardar cambios' : 'Asignar trabajo'}</button></div>
  </form>`;
  const thisYear = new Date().getFullYear();
  const rk = (ranking || []).filter(r => { const m = team.find(x => x.id === r.user_id); return m && !m.admin; })
    .map(r => ({ ...r, pts: r.participaciones + r.trabajos })).sort((a, b) => b.pts - a.pts || b.dias - a.dias || b.clientes - a.clientes);
  const medal = i => ['1º', '2º', '3º'][i] || (i + 1) + 'º';
  const logPart = `
  <h3 id="hLog">Implicación del equipo</h3>
  <div class="card stack">
    <label for="rkYear">Año<select id="rkYear">${[thisYear, thisYear - 1, thisYear - 2].map(y => opt(y, rkYear, String(y))).join('')}</select></label>
    ${ranking == null ? '<div class="hint" style="margin:0">Cargando…</div>' : rk.length ? `<div class="stack">${rk.map((r, i) => { const m = team.find(x => x.id === r.user_id);
      return `<div class="item rank${i < 3 && r.pts ? ' top' + (i + 1) : ''}"><span class="pos num">${medal(i)}</span>${avatarHTML(m, 'avatar-sm')}
        <div class="info"><div class="t">${esc(m.name)}</div><div class="d">${esc(puesto(m))}</div>
        <div class="d"><span class="nw">${r.dias} día${r.dias === 1 ? '' : 's'}</span> · <span class="nw">${r.clientes} clientes</span> · <span class="nw">${r.premios} premios</span></div></div>
        <div class="rk-pts"><b class="num">${r.pts}</b><span>particip.</span><button class="link-small" data-rlog="${esc(r.user_id)}">Ver registro</button></div></div>`; }).join('')}</div>` : '<div class="hint" style="margin:0">Aún no hay nadie en el equipo.</div>'}
    <div class="hint" style="margin:0">Cuentan las participaciones que apuntes aquí abajo y los trabajos marcados como hechos. Los días, los clientes atendidos (QR escaneados) y los premios entregados se cuentan solos.</div>
    <div class="row-btns" style="justify-content:flex-start"><button class="btn small ghost" data-export="equipo">Descargar registro</button></div>
  </div>

  <h3>Apuntar participación</h3>
  <form class="adm card" id="fLog">
    <label for="gEv">Fecha de la agenda (opcional)<select id="gEv"><option value="">Ninguna, es otra cosa</option>${D.events.filter(v => v.day <= today()).slice(-15).reverse().map(v => opt(v.id, '', fdate(v.day) + ' · ' + (v.title || (earnById(v.earn_id) || {}).name || ''))).join('')}</select></label>
    <label for="gAct">Actividad<input id="gAct" required maxlength="120" placeholder="Ej.: Pasaje del terror, ruta de Aracena"></label>
    <label for="gDay">Fecha<input id="gDay" type="date" required max="${today()}" value="${today()}"></label>
    <fieldset class="who"><legend>Quién participó</legend>${team.map(m => `<label class="check" for="gW${esc(m.id)}"><input type="checkbox" id="gW${esc(m.id)}" value="${esc(m.id)}"> <span>${esc(m.name)} <small class="muted">${esc(puesto(m))}</small></span></label>`).join('')}</fieldset>
    <label for="gNotes">Notas (opcional)<input id="gNotes" maxlength="300" placeholder="Ej.: Se quedó hasta recoger todo"></label>
    <div class="row-btns"><button class="btn">Apuntar</button></div>
  </form>`;
  const monitorAgenda = `
  <h3>Próximas fechas</h3>
  <div class="stack">${upcoming().map(v => `<div class="item"><div class="info"><div class="t">${esc(v.title || (earnById(v.earn_id) || {}).name || '')}</div><div class="d">${wday(v.day)} ${fdate(v.day)} · ${esc(v.start_time)} · ${esc(v.place)} · ${v.spots >= 999 ? 'entrada libre' : `${v.taken}/${v.spots} plazas`}</div></div></div>`).join('') || '<div class="hint">No hay fechas programadas.</div>'}</div>
  <div class="hint" style="margin-top:12px">Los precios, la agenda, los premios y los datos de los clientes solo los gestiona el jefe.</div>`;
  return `<h2>${isAdmin() ? 'Zona del jefe' : 'Zona del equipo'}</h2>
` + (isAdmin() ? adminTop + teamPart + logPart : myTasksHTML) + monitorPart + (isAdmin() ? adminRest : monitorAgenda);
}

async function openAdmin() {
  stats = null;
  render();
  if (!isAdmin()) return;
  try {
    const [st, rw, team, rk] = await Promise.all([
      rpc('staff_stats'),
      q(sb.from('rewards').select('*').order('cost')),
      q(sb.from('profiles').select('id,name,code,admin,avatar,position').eq('role', 'staff').order('admin', { ascending: false }).order('name')),
      rpc('staff_ranking', { p_year: rkYear })
    ]);
    stats = st; D.adminRewards = rw; D.team = team; ranking = rk;
    if (tab === 'admin') render();
  } catch (e) { toast('Error', e.message, true); }
}

/* =====================================================================
   Animaciones, celebraciones y hojas
   ===================================================================== */
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function animateBalance() {
  const el = $('.balance .value .n'), to = me().balance, from = shownBalance == null ? to : shownBalance;
  shownBalance = to;
  if (!el || from === to || reduceMotion()) return;
  el.textContent = fmt(from); const box = el.parentElement; box.classList.add('counting');
  const t0 = performance.now(), dur = Math.min(1600, 600 + Math.abs(to - from) / 20);
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step); else box.classList.remove('counting'); };
  requestAnimationFrame(step);
}

let tt;
function toast(big, txt, spend) {
  const t = $('#toast'), word = !/^[+−-]?[\d.]+$/.test(big); t.className = 'toast show' + (spend ? ' spend' : '') + (word ? ' word' : '');
  $('#toastBig').textContent = big; $('#toastTxt').textContent = txt;
  clearTimeout(tt); tt = setTimeout(() => t.className = 'toast' + (spend ? ' spend' : '') + (word ? ' word' : ''), 3000);
}

const celebQ = [];
function celebrate(c) { celebQ.push(c); if (celebQ.length === 1) showCeleb(); }
function showCeleb() {
  const c = celebQ[0], host = $('#celebHost'); if (!c) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="celeb" role="dialog" aria-label="${esc(c.title)}"><div class="celeb-box">
    <div class="celeb-k">${esc(c.title)}</div><div class="celeb-seal ${c.kind}"><span>${esc(c.big)}</span></div>
    <div class="celeb-name">${esc(c.name)}</div>${c.sub ? `<div class="muted" style="font-size:14px">${esc(c.sub)}</div>` : ''}
    <button class="btn" id="celebOk">¡Vamos!</button></div></div>`;
  $('#celebOk').onclick = () => { celebQ.shift(); showCeleb(); };
}

const WELCOME = [
  { big: '100', t: 'Gana Huellas', d: 'Por cada euro que gastas con nosotros ganas 100 Huellas, y más si vienes a actividades y eventos.' },
  { big: 'QR', t: 'Enseña tu QR', d: 'Al empezar cada actividad, el monitor escanea tu QR y las Huellas te llegan al momento.' },
  { big: 'X', t: 'Sobrevive y sube de nivel', d: 'Consigue los 10 sellos de supervivencia, sube de nivel y canjea tus Huellas por merch y experiencias.' }
];
function showWelcome(i) {
  const host = $('#celebHost'), w = WELCOME[i], last = i === WELCOME.length - 1;
  host.innerHTML = `<div class="celeb welcome" role="dialog" aria-label="Bienvenida"><div class="celeb-box">
    <img src="${LOGO}" alt="" class="wl-logo"><div class="celeb-k">Bienvenida a Wild Pass</div>
    <div class="celeb-seal step"><span>${w.big}</span></div><div class="celeb-name">${w.t}</div>
    <div class="muted" style="font-size:14px">${w.d}</div>
    <div class="dots">${WELCOME.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row-btns" style="justify-content:center;width:100%">${last ? '' : '<button class="btn ghost" id="wlSkip">Saltar</button>'}<button class="btn" id="wlNext">${last ? (me().welcome_given ? 'Entendido' : 'Empezar y recibir mi regalo') : 'Siguiente'}</button></div>
  </div></div>`;
  const sk = $('#wlSkip'); if (sk) sk.onclick = () => showWelcome(WELCOME.length - 1);
  $('#wlNext').onclick = () => { if (!last) return showWelcome(i + 1); finishWelcome(false); };
}
async function finishWelcome(sw) {
  const btn = $('#wlNext'); btn.disabled = true;
  try {
    const before = levelIdx();
    const r = await rpc('finish_welcome', { p_switch: sw });
    $('#celebHost').innerHTML = '';
    await load(); render();
    if (r.gift) celebrate({ kind: 'regalo', title: 'Regalo de bienvenida', big: '15%', name: 'Primera Aventura', sub: 'Lo tienes en «Mis premios». Enséñaselo al monitor en tu primera actividad.' });
    if (levelIdx() > before) celebrate({ kind: 'nivel', title: 'Empiezas en nivel', big: levels()[levelIdx()].name, name: 'Tu experiencia cuenta', sub: levels()[levelIdx()].perk });
  } catch (e) { btn.disabled = false; toast('Error', e.message, true); }
}

function sheet(html) { $('#sheetHost').innerHTML = `<div class="sheet"><div class="box" role="dialog">${html}</div></div>`; }
function closeSheet() { $('#sheetHost').innerHTML = ''; }

function showMyQR() {
  const p = me();
  sheet(`<div style="justify-items:center;text-align:center;display:grid;gap:12px">
    <div style="font-family:var(--display);font-size:22px">Mi pase de superviviente</div>
    <div class="muted">Enséñaselo al monitor al empezar la actividad.</div>
    <div id="qrBox" class="qr-box"></div>
    ${avatarHTML(p, 'avatar-md')}
    <div class="num" style="font-size:24px;font-weight:700;letter-spacing:.12em">${esc(p.code)}</div>
    <div class="muted" style="font-size:13px">${esc(p.name)} · nivel ${esc(levels()[levelIdx()].name)}</div>
    <button class="btn" data-close="1" style="width:100%">Cerrar</button></div>`);
  const box = $('#qrBox');
  try { new QRCode(box, { text: p.code, width: 220, height: 220, colorDark: '#15281b', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); }
  catch (e) { box.style.lineHeight = '1.4'; box.textContent = 'No se ha podido dibujar el QR. Usa el código de debajo.'; }
}

function showBook(id) {
  const v = D.events.find(x => x.id === id); if (!v) return;
  const e = earnById(v.earn_id) || { name: '', price: 0 }, s = D.settings, im = v.img || e.img;
  sheet(`${im ? `<img class="ev-poster" src="${esc(im)}" alt="Cartel de ${esc(v.title || e.name)}">` : ''}<div style="font-family:var(--display);font-size:22px">${esc(v.title || e.name)}</div>
    <div class="muted">${wday(v.day)} ${fdate(v.day)} · ${esc(v.start_time)} · ${esc(v.place)}${Number(e.price) ? ` · ${eur(e.price)} por persona` : ''}</div>
    ${v.spots >= 999 ? `<div class="form-ok">Entrada libre${Number(e.price) ? '' : ' y gratuita'}: no hace falta reservar. Enseña tu QR al llegar y te sumamos tus Huellas.</div>` : ''}
    <div class="card stack" style="box-shadow:none;border:1px solid var(--line)">
      <div>${v.spots >= 999 ? 'Para cualquier duda, habla con' : 'Reserva llamando o escribiendo a'} ${esc(s.contact_name)}:</div>
      <div class="kv"><span>Teléfono / WhatsApp</span><b class="num sel">${esc(s.contact_phone)}</b></div>
      <div class="kv" style="border:0;padding:0"><span>Email</span><b class="sel">${esc(s.contact_email)}</b></div>
    </div>
    ${v.spots >= 999 ? '' : `<div class="hint" style="margin:0">Dile tu código <b class="num">${esc(me().code)}</b> al reservar.</div>`}
    <div class="row-btns"><button class="btn ghost" data-copy="${esc(s.contact_phone.replace(/\s/g, ''))}">Copiar teléfono</button><button class="btn" data-close="1">Cerrar</button></div>`);
}

function askRedeem(id) {
  const r = D.rewards.find(x => x.id === id); if (!r) return;
  sheet(`<div style="font-family:var(--display);font-size:22px">${esc(r.name)}</div>
    <div class="muted">Se descontarán <b class="num" style="color:var(--fg)">${fmt(r.cost)}</b> Huellas. Te quedarán ${fmt(me().balance - r.cost)}.</div>
    <div class="row-btns"><button class="btn ghost" data-close="1">Cancelar</button><button class="btn" id="okRedeem">Canjear</button></div>`);
  $('#okRedeem').onclick = async () => {
    $('#okRedeem').disabled = true;
    try {
      const res = await rpc('redeem', { p_reward: id });
      await load(); render();
      sheet(`<div style="font-family:var(--display);font-size:22px">¡Canjeado!</div>
        <div class="muted">Enseña este código al monitor o en la tienda para recoger tu premio. Lo tienes guardado en «Mis premios».</div>
        <div class="code">${esc(res.code)}</div><button class="btn" data-close="1">Hecho</button>`);
      toast('−' + fmt(res.cost), res.name, true);
    } catch (e) { closeSheet(); toast('No se ha podido canjear', e.message, true); }
  };
}

/* ---------- Escáner de cámara (equipo) ---------- */
function openScanner(onCode) {
  sheet(`<div style="font-family:var(--display);font-size:22px">Escanear QR</div><div id="reader"></div>
    <div class="hint" style="margin:0" id="scanHint">Apunta la cámara al código.</div><button class="btn ghost" id="stopScan">Cancelar</button>`);
  const stop = () => { const s = scanner; scanner = null; if (s) { try { s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch (e) {} }); } catch (e) {} } closeSheet(); };
  $('#stopScan').onclick = stop;
  if (!window.Html5Qrcode) { $('#scanHint').textContent = 'No se ha podido cargar el escáner. Escribe el código a mano.'; return; }
  scanner = new Html5Qrcode('reader');
  scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } },
    text => { const code = String(text).trim().toUpperCase(); stop(); onCode(code); }, () => {})
    .catch(() => { $('#scanHint').textContent = 'No se ha podido abrir la cámara. Revisa el permiso del navegador o escribe el código a mano.'; });
}

async function doMonScan(code) {
  const inv = $('#mInv') ? $('#mInv').value : '';
  monAct = $('#mAct').value;
  try {
    const r = await rpc('staff_scan', { p_code: code, p_item: monAct, p_inviter: inv || null });
    let t = `+${fmt(r.value)} Huellas para ${r.name}. Ahora tiene ${fmt(r.balance)}.`;
    (r.challenges || []).forEach(c => { t += ` Completa el reto «${c.name}» (+${fmt(c.reward)}).`; });
    if (r.note) t += ' ' + r.note;
    monMsg = { ok: true, t, img: r.avatar || null, name: r.name };
    if (session && code === me().code) await load();
  } catch (e) { monMsg = { ok: false, t: e.message }; }
  render();
}
async function doCanje(code) {
  try {
    const r = await rpc('staff_validate', { p_code: code });
    canjeMsg = { ok: true, t: `Código válido. Entrega «${r.name}» a ${r.who}.` };
  } catch (e) { canjeMsg = { ok: false, t: e.message }; }
  render();
}

/* ---------- Copia de seguridad (equipo) ---------- */
async function fetchAll(table, cols, orderCol) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await q(sb.from(table).select(cols).order(orderCol).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
function toCsv(rows) {
  const cell = v => { v = v == null ? '' : String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function exportData(kind) {
  const t = today();
  const prof = await fetchAll('profiles', 'id,code,name,email,role,balance,total,since,birth', 'created_at');
  const byId = Object.fromEntries(prof.map(p => [p.id, p]));
  const who = id => byId[id] || { code: '', name: '(cuenta borrada)' };
  let rows, name;
  if (kind === 'socios') {
    name = `socios-${t}.csv`;
    rows = [['Código', 'Nombre', 'Email', 'Tipo', 'Huellas', 'Salidas', 'Socio desde', 'Nacimiento'],
      ...prof.map(p => [p.code, p.name, p.email, p.role === 'staff' ? 'Equipo' : 'Cliente', p.balance, p.total, p.since, p.birth || ''])];
  } else if (kind === 'movimientos') {
    name = `movimientos-${t}.csv`;
    const ms = await fetchAll('movements', 'user_id,text,amount,day', 'id');
    rows = [['Fecha', 'Código', 'Nombre', 'Concepto', 'Huellas'], ...ms.map(m => [m.day, who(m.user_id).code, who(m.user_id).name, m.text, m.amount])];
  } else if (kind === 'equipo') {
    name = `registro-equipo-${t}.csv`;
    const [ls, ts] = await Promise.all([fetchAll('staff_log', 'user_id,day,activity,notes', 'id'), fetchAll('tasks', 'assigned_to,day,title,notes,done', 'created_at')]);
    const all = ls.map(l => [l.day, who(l.user_id).code, who(l.user_id).name, l.activity, 'Participación', l.notes])
      .concat(ts.filter(x => x.done).map(x => [x.day, who(x.assigned_to).code, who(x.assigned_to).name, x.title, 'Trabajo hecho', x.notes]))
      .sort((a, b) => a[0] < b[0] ? -1 : 1);
    rows = [['Fecha', 'Código', 'Nombre', 'Actividad', 'Tipo', 'Notas'], ...all];
  } else {
    name = `canjes-${t}.csv`;
    const rs = await fetchAll('redemptions', 'user_id,code,name,coupon,used,created_day,used_day', 'id');
    rows = [['Fecha', 'Código socio', 'Nombre', 'Premio', 'Código canje', 'Tipo', 'Entregado', 'Fecha entrega'],
      ...rs.map(r => [r.created_day, who(r.user_id).code, who(r.user_id).name, r.name, r.code, r.coupon ? 'Cupón de bienvenida' : 'Canje', r.used ? 'Sí' : 'No', r.used_day || ''])];
  }
  download(name, toCsv(rows));
  toast('Descargado', `${name} (${rows.length - 1} filas)`);
}

/* ---------- Utilidades ---------- */
function copyText(txt) {
  try { navigator.clipboard.writeText(txt).then(() => toast('Copiado', txt.length > 40 ? 'Ya puedes pegarlo donde quieras' : txt), () => toast('No se pudo copiar', 'Selecciona el texto y cópialo a mano', true)); }
  catch (e) { toast('No se pudo copiar', 'Selecciona el texto y cópialo a mano', true); }
}
function loadImage(input) {
  const file = input && input.files && input.files[0]; if (!file) return Promise.resolve(undefined);
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(undefined); im.src = fr.result; };
    fr.onerror = () => res(undefined); fr.readAsDataURL(file);
  });
}
// fit = true: mantiene la forma de la foto (sin recortar), como máximo w x h.
async function readPhoto(input, w = 160, h = 160, fit = false) {
  const im = await loadImage(input); if (!im) return undefined;
  const c = document.createElement('canvas');
  if (fit) { const sc = Math.min(1, w / im.width, h / im.height); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); }
  else { c.width = w; c.height = h; const sc = Math.max(w / im.width, h / im.height), sw = w / sc, sh = h / sc;
    c.getContext('2d').drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 0, 0, w, h); }
  return c.toDataURL('image/jpeg', .8);
}

/* Editor de la foto de perfil: arrastra para colocar y amplía con la barra. */
function openAvatarEditor(im) {
  const V = 240; // tamaño del círculo y de la foto final
  const base = Math.max(V / im.width, V / im.height);
  let z = 1, x = 0, y = 0; // desplazamiento del centro en píxeles de pantalla
  sheet(`<div style="font-family:var(--display);font-size:22px">Coloca tu foto</div>
    <div class="muted">Arrastra la foto para centrar tu cara y usa la barra para acercar.</div>
    <div class="crop"><canvas id="cropC" width="${V * 2}" height="${V * 2}" aria-label="Vista previa de tu foto"></canvas></div>
    <label for="cropZ" class="crop-zoom">Acercar<input id="cropZ" type="range" min="1" max="4" step="0.01" value="1"></label>
    <div class="row-btns"><button class="btn ghost" data-close="1">Cancelar</button><button class="btn" id="cropOk">Guardar foto</button></div>`);
  const cv = $('#cropC'), ctx = cv.getContext('2d');
  const clamp = () => { const s = base * z, mx = Math.max(0, (im.width * s - V) / 2), my = Math.max(0, (im.height * s - V) / 2);
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y)); };
  const draw = (c, size) => { const k = size / V, s = base * z * k, g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.drawImage(im, size / 2 - im.width * s / 2 + x * k, size / 2 - im.height * s / 2 + y * k, im.width * s, im.height * s); };
  const paint = () => { clamp(); draw(cv, cv.width); };
  paint();
  let drag = null, pts = new Map(), pinch = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY, x, y];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = [Math.hypot(a[0] - b[0], a[1] - b[1]), z]; } });
  cv.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = V / cv.getBoundingClientRect().width;
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; z = Math.min(4, Math.max(1, pinch[1] * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch[0])); $('#cropZ').value = z; }
    else if (drag) { x = drag[2] + (e.clientX - drag[0]) * r; y = drag[3] + (e.clientY - drag[1]) * r; }
    paint(); });
  const up = e => { pts.delete(e.pointerId); pinch = null; if (pts.size === 1) { const [p] = [...pts.values()]; drag = [p[0], p[1], x, y]; } else drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  $('#cropZ').addEventListener('input', e => { z = +e.target.value; paint(); });
  $('#cropOk').onclick = async () => {
    $('#cropOk').disabled = true;
    const out = document.createElement('canvas'); out.width = out.height = V; draw(out, V);
    try { await rpc('set_my_avatar', { p_img: out.toDataURL('image/jpeg', .85) }); closeSheet(); await load(); render(); toast('Foto guardada', 'Así te verá el monitor'); }
    catch (e) { $('#cropOk').disabled = false; toast('No se ha podido guardar', e.message, true); }
  };
}
const val = (f, s) => f.querySelector(s).value;

/* =====================================================================
   Eventos
   ===================================================================== */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.auth) { authMode = d.auth; authMsg = null; renderAuth(); return; }
  if (d.close) return closeSheet();
  if (d.pw) { const i = b.parentElement.querySelector('input'), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Ver contraseña'); i.focus(); return; }
  if (!D) return;
  if (d.tab) { tab = d.tab; confirmDel = false; pendingDel = null; render(); window.scrollTo(0, 0); if (tab === 'admin') openAdmin(); }
  else if (d.filter) { filter = d.filter; render(); }
  else if (d.redeem) askRedeem(d.redeem);
  else if (d.myqr) showMyQR();
  else if (d.book) showBook(d.book);
  else if (d.copy) copyText(d.copy);
  else if (d.export) { b.disabled = true; try { await exportData(d.export); } catch (e) { toast('No se ha podido descargar', e.message, true); } b.disabled = false; }
  else if (d.welcome) showWelcome(0);
  else if (d.avatar === 'pick') { const i = $('#avatarIn'); if (i) i.click(); }
  else if (d.avatar === 'remove') { try { await rpc('set_my_avatar', { p_img: null }); await load(); render(); toast('Foto quitada', 'Ya no tienes foto de perfil'); } catch (e) { toast('No se ha podido quitar', e.message, true); } }
  else if (d.cam === 'mon') openScanner(code => { $('#mCode').value = code; doMonScan(code); });
  else if (d.cam === 'canje') openScanner(code => { $('#cjCode').value = code; doCanje(code); });
  else if (d.task) { b.disabled = true; try { await rpc('mark_task', { p_id: d.task, p_done: d.done === '1' }); await load(); render(); if (d.done === '1') toast('¡Hecho!', 'Trabajo completado'); } catch (e) { toast('No se ha podido guardar', e.message, true); b.disabled = false; } }
  else if (d.puesto) askPuesto(d.puesto);
  else if (d.rlog) showLog(d.rlog);
  else if (d.unlog) { b.disabled = true; try { await q(sb.from('staff_log').delete().eq('id', d.unlog)); toast('Quitado', 'Ya no cuenta en el registro', true); ranking = await rpc('staff_ranking', { p_year: rkYear }); render(); showLog(d.who); } catch (e) { toast('No se ha podido quitar', e.message, true); b.disabled = false; } }
  else if (d.assign) { assignTo = d.assign; editing.tasks = null; render(); const h = $('#hTask'); if (h) h.scrollIntoView({ block: 'start' }); const i = $('#kTitle'); if (i) i.focus({ preventScroll: true }); }
  else if (d.edit) { const [t, id] = d.edit.split(':'); editing[t] = id; render(); const h = document.getElementById(FORM_OF[t]); if (h) h.scrollIntoView({ block: 'start' }); }
  else if (d.cancel) { editing[d.cancel] = null; render(); }
  else if (d.del) {
    if (pendingDel !== d.del) { pendingDel = d.del; render(); return; }
    const [t, id] = d.del.split(':'); pendingDel = null;
    try { await q(sb.from(TABLE[t]).delete().eq('id', id)); if (editing[t] === id) editing[t] = null; await load(); await openAdmin(); toast('Quitado', 'Ya no aparece en la app del cliente', true); }
    catch (e) { toast('No se ha podido quitar', e.message, true); }
  }
  else if (d.logout) { await sb.auth.signOut(); }
  else if (d.delacc) {
    if (d.delacc === 'ask') { confirmDel = true; render(); }
    else if (d.delacc === 'no') { confirmDel = false; render(); }
    else { b.disabled = true; try { await rpc('delete_my_account'); await sb.auth.signOut(); } catch (e) { toast('No se ha podido borrar', e.message, true); b.disabled = false; } }
  }
});

document.addEventListener('change', ev => {
  if (!D) return;
  if (ev.target.id === 'rkYear') { rkYear = +ev.target.value; ranking = null; render(); rpc('staff_ranking', { p_year: rkYear }).then(r => { ranking = r; render(); }, e => toast('No se ha podido cargar', e.message, true)); return; }
  if (ev.target.id === 'gEv') { const v = D.events.find(x => x.id === ev.target.value); if (v) { $('#gAct').value = v.title || (earnById(v.earn_id) || {}).name || ''; $('#gDay').value = v.day; } return; }
  if (ev.target.id !== 'kEv') return;
  const v = D.events.find(x => x.id === ev.target.value); if (!v) return;
  $('#kDay').value = v.day; $('#kTime').value = v.start_time || ''; $('#kPlace').value = v.place || '';
});
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'avatarIn' || !D) return;
  const im = await loadImage(ev.target); ev.target.value = '';
  if (!im) return toast('No se ha podido leer la foto', 'Prueba con otra imagen', true);
  openAvatarEditor(im);
});

document.addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'fAuth') return submitAuth(f);
  if (f.id === 'fNewPass') {
    try { await q(sb.auth.updateUser({ password: $('#npPass').value })); closeSheet(); toast('Guardada', 'Ya puedes entrar con tu contraseña nueva'); boot(); }
    catch (e) { toast('Error', e.message, true); }
    return;
  }
  if (!D) return;
  const btn = f.querySelector('button.btn:not([type=button])'); if (btn) btn.disabled = true;
  try {
    if (f.id === 'fMon') { const c = val(f, '#mCode').trim(); if (!c) throw new Error('Escribe el código o usa la cámara.'); await doMonScan(c); return; }
    if (f.id === 'fCanje') { const c = val(f, '#cjCode').trim(); if (!c) throw new Error('Escribe el código o usa la cámara.'); await doCanje(c); return; }
    if (f.id === 'fPerfil') {
      await rpc('update_my_name', { p_name: val(f, '#pName') });
      const bi = f.querySelector('#pBirth');
      if (bi && bi.value) await rpc('set_my_birth', { p_date: bi.value });
      await load(); toast('Guardado', 'Tus datos están actualizados');
    }
    else if (f.id === 'fEvent') {
      const spots = Math.max(1, +val(f, '#vSpots') || 1), taken = Math.min(spots, Math.max(0, +val(f, '#vTaken') || 0));
      const data = { earn_id: val(f, '#vEarn'), title: val(f, '#vTitle').trim(), day: val(f, '#vDate'), start_time: val(f, '#vTime'), place: val(f, '#vPlace').trim(), spots, taken };
      const vi = await readPhoto(f.querySelector('#vImg'), 600, 900, true); if (vi) data.img = vi;
      if (editing.events) await q(sb.from('events').update(data).eq('id', editing.events)); else await q(sb.from('events').insert(data));
      editing.events = null; toast('Guardado', 'La agenda está actualizada');
    }
    else if (f.id === 'fSeason') {
      const img = await readPhoto(f.querySelector('#sImg'), 560, 280);
      const season = { ...D.settings.season, tag: val(f, '#sTag').trim(), title: val(f, '#sTitle').trim(), text: val(f, '#sText').trim() };
      if (img) season.img = img;
      await q(sb.from('settings').update({ season }).eq('id', 1)); toast('Guardado', 'La temporada ya se ve en «Retos»');
    }
    else if (f.id === 'fEarn') {
      const img = await readPhoto(f.querySelector('#ePhoto'));
      const data = { kind: val(f, '#eKind'), name: val(f, '#eName').trim(), price: +val(f, '#ePrice') || 0, bonus: +val(f, '#eBonus') || 0, counts: val(f, '#eCounts') === '1', note: val(f, '#eNote').trim() || null };
      if (img) data.img = img;
      if (editing.earn) await q(sb.from('earn_items').update(data).eq('id', editing.earn)); else await q(sb.from('earn_items').insert(data));
      editing.earn = null; toast('Guardado', 'El catálogo está actualizado');
    }
    else if (f.id === 'fReward') {
      const img = await readPhoto(f.querySelector('#rPhoto'));
      const data = { name: val(f, '#rName').trim(), cost: Math.max(100, +val(f, '#rCost') || 100), cat: val(f, '#rCat'), min_level: +val(f, '#rMin') };
      if (img) data.img = img;
      if (editing.rewards) await q(sb.from('rewards').update(data).eq('id', editing.rewards)); else await q(sb.from('rewards').insert(data));
      editing.rewards = null; toast('Guardado', 'Los premios están actualizados');
    }
    else if (f.id === 'fChal') {
      const data = { name: val(f, '#cName').trim(), description: val(f, '#cDesc').trim(), goal: Math.max(1, +val(f, '#cGoal') || 1), track: val(f, '#cTrack'), reward: Math.max(0, +val(f, '#cReward') || 0) };
      if (editing.challenges) await q(sb.from('challenges').update(data).eq('id', editing.challenges)); else await q(sb.from('challenges').insert(data));
      editing.challenges = null; toast('Guardado', 'Los retos están actualizados');
    }
    else if (f.id === 'fLevels') {
      const lv = levels().map((l, i) => ({ name: val(f, '#lName' + i).trim() || l.name, min: i === 0 ? 0 : Math.max(0, +val(f, '#lMin' + i) || 0), mult: Math.max(0, +val(f, '#lMult' + i) || 0), perk: val(f, '#lPerk' + i).trim() }));
      if (lv.some((l, i) => i > 0 && l.min <= lv[i - 1].min)) throw new Error('Cada nivel tiene que pedir más actividades que el anterior.');
      await q(sb.from('settings').update({ levels: lv }).eq('id', 1)); toast('Guardado', 'Niveles actualizados');
    }
    else if (f.id === 'fContact') {
      await q(sb.from('settings').update({ contact_name: val(f, '#kName').trim(), contact_phone: val(f, '#kPhone').trim(), contact_email: val(f, '#kEmail').trim(),
        birthday_bonus: Math.max(0, +val(f, '#kBday') || 0), welcome_coupon: val(f, '#kCoupon').trim() || D.settings.welcome_coupon }).eq('id', 1));
      toast('Guardado', 'Datos de contacto actualizados');
    }
    else if (f.id === 'fTask') {
      const data = { assigned_to: val(f, '#kWho'), event_id: val(f, '#kEv') || null, title: val(f, '#kTitle').trim(), day: val(f, '#kDay'),
        start_time: val(f, '#kTime'), place: val(f, '#kPlace').trim(), notes: val(f, '#kNotes').trim() };
      if (!data.title || !data.day) throw new Error('Pon qué hay que hacer y la fecha.');
      if (editing.tasks) await q(sb.from('tasks').update(data).eq('id', editing.tasks)); else await q(sb.from('tasks').insert(data));
      const who = (D.team || []).find(m => m.id === data.assigned_to);
      toast(editing.tasks ? 'Guardado' : 'Trabajo asignado', who ? `${who.name} lo verá en su zona del equipo` : 'Ya está en la lista');
      editing.tasks = null; assignTo = data.assigned_to;
    }
    else if (f.id === 'fLog') {
      const who = [...f.querySelectorAll('.who input:checked')].map(i => i.value);
      if (!who.length) throw new Error('Marca quién participó.');
      const base = { day: val(f, '#gDay'), activity: val(f, '#gAct').trim(), notes: val(f, '#gNotes').trim(), event_id: val(f, '#gEv') || null };
      if (!base.activity || !base.day) throw new Error('Pon la actividad y la fecha.');
      await q(sb.from('staff_log').insert(who.map(u => ({ ...base, user_id: u }))));
      toast('Apuntado', `${who.length} persona${who.length > 1 ? 's' : ''} en ${base.activity}`);
    }
    else if (f.id === 'fTeam') {
      const r = await rpc('admin_set_role', { p_code: val(f, '#tCode'), p_role: val(f, '#tRole') });
      toast('Guardado', r.role === 'staff' ? `${r.name} ya es monitor` : `${r.name} ya no es del equipo`);
    }
    else if (f.id === 'fBirth') {
      await rpc('staff_set_birth', { p_code: val(f, '#bCode'), p_date: val(f, '#bDate') });
      toast('Corregido', 'Fecha de nacimiento actualizada');
    }
    await load();
    if (tab === 'admin') await openAdmin(); else render();
  } catch (e) {
    toast('No se ha podido guardar', e.message, true);
    if (btn) btn.disabled = false;
  }
});

start();

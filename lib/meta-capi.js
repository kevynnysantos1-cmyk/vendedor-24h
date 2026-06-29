// Meta Conversions API (server-side) — CommonJS.
// Envia eventos direto pro Meta. Usa o MESMO eventID do Pixel (purchase_<id>) pra dedup.
// Env: META_CAPI_TOKEN (obrigatório p/ enviar), META_PIXEL_ID (default abaixo).
const crypto = require('crypto');

const API_VERSION = 'v21.0';
const DEFAULT_PIXEL_ID = '1055527824036523';

function hash(v) {
  if (v === undefined || v === null || v === '') return undefined;
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}
const DIACRITIC_RE = new RegExp('[' + String.fromCodePoint(0x0300) + '-' + String.fromCodePoint(0x036F) + ']', 'g');
function stripAccents(v) {
  if (!v) return undefined;
  return String(v).normalize('NFD').replace(DIACRITIC_RE, '').toLowerCase().trim();
}
function normEmail(e) { return e ? String(e).trim().toLowerCase() : undefined; }
function normPhone(p) {
  if (!p) return undefined;
  const d = String(p).replace(/\D/g, '');
  if (!d) return undefined;
  return (d.length === 10 || d.length === 11) ? '55' + d : d; // BR
}
function normName(n) { const c = stripAccents(n); return c ? c.replace(/[^a-z0-9]/g, '') : undefined; }
function normDigits(v) { const d = v ? String(v).replace(/\D/g, '') : ''; return d || undefined; }

function parseAmount(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).trim();
  if (s.indexOf(',') !== -1) { const n = Number(s.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
  const n = Number(s); return isNaN(n) ? 0 : n;
}

function buildUserData(u) {
  u = u || {};
  const ud = {};
  const em = normEmail(u.email);   if (em) ud.em = [hash(em)];
  const ph = normPhone(u.phone);   if (ph) ud.ph = [hash(ph)];
  const fn = normName(u.firstName); if (fn) ud.fn = [hash(fn)];
  const ln = normName(u.lastName);  if (ln) ud.ln = [hash(ln)];
  const ex = normDigits(u.externalId); if (ex) ud.external_id = [hash(ex)];
  if (u.fbc) ud.fbc = u.fbc;
  if (u.fbp) ud.fbp = u.fbp;
  if (u.ip) ud.client_ip_address = u.ip;
  if (u.userAgent) ud.client_user_agent = u.userAgent;
  return ud;
}

async function sendCapiEvent(opts) {
  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!token) { console.warn('[CAPI] META_CAPI_TOKEN não configurado — evento ignorado'); return { ok: false, error: 'token_missing' }; }

  const event = {
    event_name: opts.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    event_source_url: opts.eventSourceUrl,
    action_source: 'website',
    user_data: buildUserData(opts.userData),
    custom_data: opts.customData || {}
  };
  const testCode = opts.testEventCode || process.env.META_CAPI_TEST_EVENT_CODE;
  const payload = { data: [event] };
  if (testCode) payload.test_event_code = testCode;

  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('[CAPI]', opts.eventName, res.status, JSON.stringify(data).slice(0, 300)); return { ok: false, status: res.status, data }; }
    console.log('[CAPI]', opts.eventName, 'ok', { event_id: opts.eventId, received: data.events_received });
    return { ok: true, data };
  } catch (e) {
    console.error('[CAPI]', opts.eventName, 'exception', e.message);
    return { ok: false, error: e.message };
  }
}

// Purchase — eventId DEVE ser purchase_<paymentId> p/ casar com o Pixel do navegador.
async function trackPurchaseCapi(o) {
  const parts = (o.customer && o.customer.fullName || '').trim().split(/\s+/);
  return sendCapiEvent({
    eventName: 'Purchase',
    eventId: 'purchase_' + o.orderId,
    eventSourceUrl: o.eventSourceUrl || 'https://vendedor-24h.vercel.app/checkout.html',
    userData: {
      email: o.customer && o.customer.email,
      phone: o.customer && o.customer.phone,
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
      externalId: o.customer && o.customer.cpf,
      fbc: o.fbc, fbp: o.fbp, ip: o.ip, userAgent: o.userAgent
    },
    customData: {
      currency: o.currency || 'BRL',
      value: parseAmount(o.total),
      content_type: 'product',
      content_ids: (o.products || []).map(p => String(p.id || p.sku)),
      num_items: (o.products || []).length || 1,
      order_id: String(o.orderId)
    }
  });
}

module.exports = { sendCapiEvent, trackPurchaseCapi, buildUserData, parseAmount };

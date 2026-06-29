// Utmify (server-side) — CommonJS. Envia o pedido direto pra Utmify (à prova de adblock).
// Env: UTMIFY_API_TOKEN. Docs: https://docs.utmify.com.br/
const ENDPOINT = 'https://api.utmify.com.br/api-credentials/orders';

function mapStatus(s) {
  const m = { pending: 'waiting_payment', in_process: 'waiting_payment', waiting_payment: 'waiting_payment',
    approved: 'paid', paid: 'paid', authorized: 'paid',
    rejected: 'refused', cancelled: 'refused', refused: 'refused',
    refunded: 'refunded', charged_back: 'chargedback', chargeback: 'chargedback' };
  return m[String(s).toLowerCase()] || 'waiting_payment';
}
function mapMethod(p) {
  const m = { pix: 'pix', credit_card: 'credit_card', debit_card: 'credit_card', card: 'credit_card', bank_transfer: 'pix', ticket: 'billet', bolbradesco: 'billet' };
  return m[String(p || '').toLowerCase()] || 'pix';
}
// Utmify exige data no formato "YYYY-MM-DD HH:MM:SS" em UTC.
function utcIso(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  if (isNaN(dt.getTime())) return new Date().toISOString().replace('T', ' ').slice(0, 19);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
}

async function sendOrderToUtmify(o) {
  const token = process.env.UTMIFY_API_TOKEN;
  if (!token) { console.warn('[Utmify] UTMIFY_API_TOKEN não configurado — pedido ignorado'); return { ok: false, error: 'token_missing' }; }

  const status = mapStatus(o.status);
  const payload = {
    orderId: String(o.orderId),
    platform: o.platform || 'MercadoPago',
    paymentMethod: mapMethod(o.paymentMethod),
    status: status,
    createdAt: utcIso(o.createdAt),
    approvedDate: status === 'paid' ? utcIso(o.approvedDate || new Date()) : null,
    refundedAt: status === 'refunded' ? utcIso(o.refundedAt || new Date()) : null,
    customer: {
      name: (o.customer && o.customer.name) || '',
      email: (o.customer && o.customer.email) || '',
      phone: (o.customer && o.customer.phone) || null,
      document: (o.customer && o.customer.document) || null,
      country: 'BR',
      ip: (o.customer && o.customer.ip) || null
    },
    products: (o.products || []).map(p => ({
      id: String(p.id || p.sku || ''),
      name: p.name || '',
      planId: null, planName: null,
      quantity: Number(p.quantity || p.qty || 1),
      priceInCents: Number(p.priceInCents != null ? p.priceInCents : Math.round((p.price || 0) * 100))
    })),
    trackingParameters: {
      src: (o.tracking && o.tracking.src) || null,
      sck: (o.tracking && o.tracking.sck) || null,
      utm_source: (o.tracking && o.tracking.utm_source) || null,
      utm_campaign: (o.tracking && o.tracking.utm_campaign) || null,
      utm_medium: (o.tracking && o.tracking.utm_medium) || null,
      utm_content: (o.tracking && o.tracking.utm_content) || null,
      utm_term: (o.tracking && o.tracking.utm_term) || null
    },
    commission: {
      totalPriceInCents: Number(o.totalPriceInCents || 0),
      gatewayFeeInCents: 0,
      userCommissionInCents: Number(o.totalPriceInCents || 0)
    },
    isTest: !!o.isTest
  };

  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-token': token }, body: JSON.stringify(payload) });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    if (!res.ok) { console.error('[Utmify] erro', res.status, JSON.stringify(data).slice(0, 300)); return { ok: false, status: res.status, data }; }
    console.log('[Utmify] enviado', { orderId: payload.orderId, status, utm_source: payload.trackingParameters.utm_source });
    return { ok: true, data };
  } catch (e) {
    console.error('[Utmify] exception', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendOrderToUtmify };

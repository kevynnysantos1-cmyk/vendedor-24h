// Webhook Mercado Pago — captura o pagamento mesmo se o cliente fechou a aba.
// Configurar no painel MP: Notificações/Webhooks → URL:
//   https://vendedor-24h.vercel.app/api/webhook/mercadopago   → evento "Pagamentos".
//
// Fluxo: MP avisa → consultamos o status real → se aprovado dispara Meta CAPI (Purchase,
// MESMO eventID do Pixel = purchase_<id>, então o Meta deduplica) + Utmify (paid).
// Se pendente, manda Utmify waiting_payment. Os dados de tracking vêm do metadata do
// pagamento (gravado em criar-pix / processar-pagamento).
const { trackPurchaseCapi } = require('../../lib/meta-capi.js');
const { sendOrderToUtmify } = require('../../lib/utmify.js');

// Dedup in-memory (a Vercel reusa a instância por alguns minutos).
const SEEN = new Map();
const TTL = 10 * 60 * 1000;
function already(k) {
  const t = SEEN.get(k);
  if (t && Date.now() - t < TTL) return true;
  SEEN.set(k, Date.now());
  if (SEEN.size > 500) for (const [key, ts] of SEEN) if (Date.now() - ts > TTL) SEEN.delete(key);
  return false;
}

async function getPayment(id) {
  const token = process.env.MP_ACCESS_TOKEN;
  const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(id), {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
  });
  return r.json().catch(() => ({}));
}

function reconstruct(p) {
  const meta = p.metadata || {};
  const payer = p.payer || {};
  const amount = p.transaction_amount;
  const isPix = p.payment_method_id === 'pix' || p.payment_type_id === 'bank_transfer';
  let products = [];
  try { const arr = JSON.parse(meta.products_json || '[]'); if (Array.isArray(arr)) products = arr; } catch (e) {}
  if (!products.length) products = [{ id: 'base', name: 'Vendedor 24h', qty: 1, price: amount }];
  return {
    orderId: p.id,
    amount: amount,
    method: isPix ? 'pix' : 'credit_card',
    customer: {
      name: meta.full_name || `${payer.first_name || ''} ${payer.last_name || ''}`.trim(),
      email: meta.email || payer.email || null,
      phone: meta.phone || null,
      cpf: (payer.identification && payer.identification.number) || meta.cpf_doc || null,
      ip: meta.client_ip || null
    },
    userAgent: meta.user_agent || null,
    fbc: meta.fbc || null, fbp: meta.fbp || null, fbclid: meta.fbclid || null,
    eventSourceUrl: meta.event_source_url || null,
    tracking: {
      utm_source: meta.utm_source || null, utm_medium: meta.utm_medium || null,
      utm_campaign: meta.utm_campaign || null, utm_content: meta.utm_content || null,
      utm_term: meta.utm_term || null, src: meta.src || null, sck: meta.sck || null
    },
    products: products
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  try {
    const q = req.query || {};
    const b = (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body) || {};
    const type = q.type || q.topic || b.type || b.topic;
    const paymentId = q['data.id'] || q.id || (b.data && b.data.id) || b.id;

    if (type && type !== 'payment') return res.status(200).json({ status: 'ignored', type });
    if (!paymentId || !/^\d+$/.test(String(paymentId))) return res.status(200).json({ status: 'no_payment_id' });

    const p = await getPayment(paymentId);
    const order = reconstruct(p);
    console.log('[MP Webhook]', paymentId, '→', p.status);

    const productsUtmify = order.products.map(x => ({ id: x.sku || x.id, name: x.name, quantity: x.qty || 1, priceInCents: Math.round((Number(x.price) || 0) * 100) }));
    const totalCents = Math.round((Number(order.amount) || 0) * 100);

    if (p.status === 'approved') {
      if (already('paid:' + paymentId)) return res.status(200).json({ status: 'duplicate', payment: paymentId });
      // Meta CAPI — Purchase (dedup com o Pixel via eventID purchase_<id>)
      trackPurchaseCapi({
        orderId: paymentId, customer: { fullName: order.customer.name, email: order.customer.email, phone: order.customer.phone, cpf: order.customer.cpf },
        total: order.amount, currency: 'BRL', products: order.products.map(x => ({ id: x.sku || x.id })),
        fbc: order.fbc, fbclid: order.fbclid, fbp: order.fbp, ip: order.customer.ip, userAgent: order.userAgent,
        eventSourceUrl: order.eventSourceUrl
      }).catch(e => console.error('[Webhook CAPI]', e.message));
      // Utmify — paid
      try {
        await sendOrderToUtmify({
          orderId: paymentId, paymentMethod: order.method, status: 'paid',
          createdAt: p.date_created, approvedDate: p.date_approved || new Date(),
          customer: { name: order.customer.name, email: order.customer.email, phone: order.customer.phone, document: order.customer.cpf, ip: order.customer.ip },
          products: productsUtmify, tracking: order.tracking, totalPriceInCents: totalCents
        });
      } catch (e) { console.error('[Webhook Utmify paid]', e.message); }
      // TODO: aqui também dá pra disparar a entrega automática do acesso por e-mail.
      return res.status(200).json({ status: 'ok', payment: paymentId, action: 'purchase_fired' });
    }

    if (p.status === 'pending' || p.status === 'in_process') {
      if (already('wait:' + paymentId)) return res.status(200).json({ status: 'duplicate', payment: paymentId });
      try {
        await sendOrderToUtmify({
          orderId: paymentId, paymentMethod: order.method, status: 'waiting_payment',
          createdAt: p.date_created || new Date(),
          customer: { name: order.customer.name, email: order.customer.email, phone: order.customer.phone, document: order.customer.cpf, ip: order.customer.ip },
          products: productsUtmify, tracking: order.tracking, totalPriceInCents: totalCents
        });
      } catch (e) { console.error('[Webhook Utmify wait]', e.message); }
      return res.status(200).json({ status: 'ok', payment: paymentId, action: 'waiting' });
    }

    if (p.status === 'rejected' || p.status === 'cancelled') {
      try {
        await sendOrderToUtmify({
          orderId: paymentId, paymentMethod: order.method, status: 'refused', createdAt: p.date_created || new Date(),
          customer: { name: order.customer.name, email: order.customer.email, phone: order.customer.phone, document: order.customer.cpf, ip: order.customer.ip },
          products: productsUtmify, tracking: order.tracking, totalPriceInCents: totalCents
        });
      } catch (e) {}
      return res.status(200).json({ status: 'ok', payment: paymentId, action: 'refused' });
    }

    return res.status(200).json({ status: 'ok', payment: paymentId, mp_status: p.status, action: 'none' });
  } catch (err) {
    console.error('[MP Webhook] erro:', err);
    return res.status(200).json({ status: 'error', message: 'erro interno' });
  }
};

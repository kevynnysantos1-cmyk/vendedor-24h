// Preços (fonte única) + montagem do metadata de tracking gravado no pagamento MP.
// O webhook lê esse metadata depois pra reconstruir o pedido (CAPI + Utmify).
const PRECOS = {
  base: { id: 'base', name: 'Vendedor 24h — seu WhatsApp vendendo sozinho', price: 50.0 },
  b1:   { id: 'b1',   name: 'Designer 24h (IA)',          price: 37.0 },
  b2:   { id: 'b2',   name: 'Recuperador de Vendas 24h',  price: 27.0 },
  b3:   { id: 'b3',   name: 'Máquina de Conteúdo 24h',    price: 19.0 },
};
function calcTotal(bumps) {
  let t = PRECOS.base.price;
  (bumps || []).forEach(function (id) { if (PRECOS[id]) t += PRECOS[id].price; });
  return Math.round(t * 100) / 100;
}
const PIX_OFF = 0.05; // 5% de desconto no Pix
function pixTotal(bumps) {
  return Math.round(calcTotal(bumps) * (1 - PIX_OFF) * 100) / 100;
}
function productsFor(bumps) {
  const list = [Object.assign({ qty: 1 }, PRECOS.base)];
  (bumps || []).forEach(function (k) { if (PRECOS[k]) list.push(Object.assign({ qty: 1 }, PRECOS[k])); });
  return list;
}
function clientIp(req) {
  try { return (String(((req && req.headers) || {})['x-forwarded-for'] || '').split(',')[0].trim()) || null; }
  catch (e) { return null; }
}
// Monta um objeto plano de strings p/ o campo metadata do pagamento MP.
function buildMetadata(o) {
  o = o || {};
  const req = o.req || { headers: {} };
  const meta = o.meta || {};
  const utms = o.utms || {};
  if (utms.fbclid && !utms.utm_source) { utms.utm_source = 'facebook'; utms.utm_medium = utms.utm_medium || 'paid-social'; }
  if (utms.gclid && !utms.utm_source) { utms.utm_source = 'google'; utms.utm_medium = utms.utm_medium || 'cpc'; }
  const m = {
    full_name: String(o.nome || '').slice(0, 120),
    email: String(o.email || '').slice(0, 120),
    phone: String(o.phone || '').replace(/\D/g, ''),
    cpf_doc: String(o.cpf || '').replace(/\D/g, ''),
    client_ip: clientIp(req) || '',
    user_agent: String(meta.user_agent || (req.headers && req.headers['user-agent']) || '').slice(0, 400),
    fbc: String(meta.fbc || '').slice(0, 200),
    fbp: String(meta.fbp || '').slice(0, 200),
    utm_source: String(utms.utm_source || ''), utm_medium: String(utms.utm_medium || ''),
    utm_campaign: String(utms.utm_campaign || ''), utm_content: String(utms.utm_content || ''),
    utm_term: String(utms.utm_term || ''), src: String(utms.src || ''), sck: String(utms.sck || ''),
    products_json: JSON.stringify(productsFor(o.bumps)).slice(0, 900),
    value: String(o.amount != null ? o.amount : '')
  };
  Object.keys(m).forEach(function (k) { if (m[k] === '' || m[k] == null) delete m[k]; });
  return m;
}
module.exports = { PRECOS, PIX_OFF, calcTotal, pixTotal, productsFor, buildMetadata, clientIp };

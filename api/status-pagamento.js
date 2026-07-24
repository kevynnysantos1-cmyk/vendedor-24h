// Consulta o status de um pagamento (usado para confirmar o Pix automaticamente).
module.exports = async (req, res) => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' }); return; }
  const id = (req.query && req.query.id) || '';
  if (!id) { res.status(400).json({ error: 'id obrigatório' }); return; }
  try {
    const mp = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(id), {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const d = await mp.json();
    const description = String(d.description || '').toLowerCase();
    let products = [];
    try { products = JSON.parse((d.metadata && d.metadata.products_json) || '[]'); } catch (e) {}
    const belongsToVendedor24h = description.indexOf('vendedor 24h') !== -1 ||
      products.some(function (item) { return item && item.id === 'base'; });
    res.setHeader('Cache-Control', 'no-store');
    res.status(mp.ok ? 200 : mp.status).json({
      status: d.status,
      status_detail: d.status_detail,
      access_granted: d.status === 'approved' && belongsToVendedor24h
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

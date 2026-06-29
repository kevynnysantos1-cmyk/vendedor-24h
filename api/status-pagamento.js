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
    res.status(mp.ok ? 200 : mp.status).json({ status: d.status, status_detail: d.status_detail });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

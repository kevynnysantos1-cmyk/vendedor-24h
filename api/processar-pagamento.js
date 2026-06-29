// Checkout Transparente — processa o pagamento (Pix ou cartão) via API do Mercado Pago.
// Recebe o formData do Payment Brick (cartão já vem TOKENIZADO — o número do cartão
// nunca passa pelo servidor) e cria o pagamento em /v1/payments.
// A chave secreta fica em MP_ACCESS_TOKEN (Environment Variables da Vercel).

const { calcTotal, buildMetadata } = require('../lib/order-meta.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido' }); return; }
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fd = body.formData || {};
    const amount = calcTotal(body.bumps);

    // O valor é SEMPRE recalculado no servidor (não confia no front).
    const fdCpf = (fd.payer && fd.payer.identification && fd.payer.identification.number) || body.cpf;
    const payment = {
      transaction_amount: amount,
      description: 'Vendedor 24h',
      payment_method_id: fd.payment_method_id,
      payer: fd.payer || {},
      metadata: buildMetadata({ req: req, nome: body.nome, cpf: fdCpf, email: (fd.payer && fd.payer.email) || body.email, phone: body.phone, bumps: body.bumps, meta: body.meta, utms: body.utms, amount: amount }),
    };
    if (fd.token) payment.token = fd.token;                 // cartão tokenizado
    if (fd.installments) payment.installments = fd.installments;
    if (fd.issuer_id) payment.issuer_id = fd.issuer_id;

    const mp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'v24h-' + Date.now() + '-' + Math.floor(Math.random() * 1e9),
      },
      body: JSON.stringify(payment),
    });
    const data = await mp.json();
    if (!mp.ok) {
      res.status(mp.status).json({ error: (data && data.message) || 'Erro Mercado Pago', detalhe: data });
      return;
    }
    const poi = data.point_of_interaction && data.point_of_interaction.transaction_data;
    res.status(200).json({
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      amount: amount,
      pix: poi ? { qr_code: poi.qr_code, qr_code_base64: poi.qr_code_base64, ticket_url: poi.ticket_url } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

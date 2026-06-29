// Cria um pagamento Pix transparente (QR direto na página) usando SÓ o MP_ACCESS_TOKEN.
// Não precisa de chave pública nem de SDK no navegador — funciona com o token já configurado.

const PRECOS = {
  base: { title: 'Vendedor 24h — seu WhatsApp vendendo sozinho', price: 50.0 },
  b1:   { title: 'Designer 24h (IA)',         price: 37.0 },
  b2:   { title: 'Recuperador de Vendas 24h', price: 27.0 },
  b3:   { title: 'Máquina de Conteúdo 24h',   price: 19.0 },
};
function calcTotal(bumps) {
  let t = PRECOS.base.price;
  (bumps || []).forEach(function (id) { if (PRECOS[id]) t += PRECOS[id].price; });
  return Math.round(t * 100) / 100;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido' }); return; }
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const amount = calcTotal(body.bumps);
    const nome = (body.nome || '').trim();
    const cpf = (body.cpf || '').replace(/\D/g, '');

    const payer = {
      email: body.email,
      first_name: nome.split(' ')[0] || 'Cliente',
      last_name: nome.split(' ').slice(1).join(' ') || '.',
    };
    if (cpf.length >= 11) payer.identification = { type: 'CPF', number: cpf };

    const payment = {
      transaction_amount: amount,
      description: 'Vendedor 24h',
      payment_method_id: 'pix',
      payer: payer,
    };

    const mp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'v24hpix-' + Date.now() + '-' + Math.floor(Math.random() * 1e9),
      },
      body: JSON.stringify(payment),
    });
    const data = await mp.json();
    if (!mp.ok) { res.status(mp.status).json({ error: (data && data.message) || 'Erro Mercado Pago', detalhe: data }); return; }
    const poi = data.point_of_interaction && data.point_of_interaction.transaction_data;
    res.status(200).json({
      id: data.id,
      status: data.status,
      amount: amount,
      pix: poi ? { qr_code: poi.qr_code, qr_code_base64: poi.qr_code_base64, ticket_url: poi.ticket_url } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

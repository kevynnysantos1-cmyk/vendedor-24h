// Função serverless (Vercel) que cria uma preferência de pagamento no Mercado Pago.
// A chave secreta fica na variável de ambiente MP_ACCESS_TOKEN — NUNCA no código/repositório.
// Doc: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/landing

const PRECOS = {
  base: { title: 'Vendedor 24h — seu WhatsApp vendendo sozinho', price: 50.0 },
  b1:   { title: 'Designer 24h (IA)',         price: 37.0 },
  b2:   { title: 'Recuperador de Vendas 24h', price: 27.0 },
  b3:   { title: 'Máquina de Conteúdo 24h',   price: 19.0 },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado no servidor' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const bumps = Array.isArray(body.bumps) ? body.bumps : [];

    // O servidor define os preços (o cliente só diz QUAIS itens marcou) — evita adulteração de valor.
    const items = [{
      title: PRECOS.base.title, quantity: 1, currency_id: 'BRL', unit_price: PRECOS.base.price,
    }];
    bumps.forEach(function (id) {
      if (PRECOS[id]) items.push({ title: PRECOS[id].title, quantity: 1, currency_id: 'BRL', unit_price: PRECOS[id].price });
    });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = req.headers.origin || (proto + '://' + req.headers.host);

    const preference = {
      items: items,
      back_urls: {
        success: origin + '/checkout.html?status=sucesso',
        pending: origin + '/checkout.html?status=pendente',
        failure: origin + '/checkout.html?status=falha',
      },
      auto_return: 'approved',
      statement_descriptor: 'VENDEDOR24H',
      external_reference: 'v24h-' + Date.now(),
    };

    const mp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(preference),
    });
    const data = await mp.json();
    if (!mp.ok) {
      res.status(mp.status).json({ error: 'Erro do Mercado Pago', detail: data });
      return;
    }
    res.status(200).json({ init_point: data.init_point, id: data.id });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

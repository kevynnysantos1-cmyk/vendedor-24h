# Integração Mercado Pago (Checkout Pro)

O botão **Pagar** do checkout cria uma cobrança real no Mercado Pago através de um
backend (`api/criar-preferencia.js`). Esse backend guarda sua **chave secreta** com
segurança — ela **nunca** fica no HTML público.

> Enquanto o backend não estiver publicado (ex.: no GitHub Pages, que é só estático),
> o checkout continua funcionando no modo **protótipo**. A cobrança real só funciona
> no domínio onde o backend roda (Vercel).

## Passo a passo (Vercel — grátis)

### 1. Pegue sua Access Token do Mercado Pago
- Acesse: https://www.mercadopago.com.br/developers/panel/app
- Crie/abra uma aplicação → **Credenciais de produção** → copie o **Access Token**
  (começa com `APP_USR-...`).
- Para testar antes, use as **Credenciais de teste** + cartões de teste do Mercado Pago.

### 2. Publique o projeto na Vercel
- Acesse https://vercel.com e faça login com o **GitHub**.
- **Add New → Project → Import** o repositório `kevynnysantos1-cmyk/vendedor-24h`.
- Framework Preset: **Other** (é site estático + função em `/api`).
- Em **Environment Variables**, adicione:
  - **Name:** `MP_ACCESS_TOKEN`
  - **Value:** sua Access Token (a `APP_USR-...`)
- Clique em **Deploy**.

### 3. Pronto
- Seu site fica em `https://<seu-projeto>.vercel.app`.
- Nesse domínio, o botão **Pagar** leva o cliente direto pro Mercado Pago (Pix e cartão),
  e ao aprovar ele volta pra `/checkout.html?status=sucesso` (dispara o evento `Purchase` do pixel).

## ⚠️ Importante
- **Nunca** coloque a Access Token no código ou no repositório. Só na variável de
  ambiente da Vercel (`MP_ACCESS_TOKEN`).
- Os **preços ficam no backend** (`api/criar-preferencia.js`, objeto `PRECOS`) — assim
  ninguém adultera valor pelo navegador. Para mudar preços, edite ali.
- O desconto de 5% no Pix (que existia no protótipo) **não** é aplicado na cobrança real
  por padrão — o cliente escolhe o método na tela do Mercado Pago. Dá pra adicionar
  depois via cupom/regra do MP, se você quiser.

## Próximo passo (opcional, depois): liberar acesso automático
Para liberar o produto sozinho quando o pagamento aprova, configure um **webhook**
(`notification_url`) apontando pra uma função que verifica o pagamento e envia o acesso.
Posso montar isso quando você quiser.

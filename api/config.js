// Expõe a Public Key do Mercado Pago para o front (a Public Key NÃO é secreta).
// Configure MP_PUBLIC_KEY nas Environment Variables da Vercel.
module.exports = async (req, res) => {
  res.status(200).json({ publicKey: process.env.MP_PUBLIC_KEY || '' });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, pagamentoId } = req.body;
  if (!uid || !pagamentoId) return res.status(400).json({ error: 'uid e pagamentoId obrigatórios' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const FB_KEY       = process.env.FIREBASE_API_KEY;

  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'Token MP não configurado' });
  if (!FB_KEY)       return res.status(500).json({ error: 'Firebase key não configurada' });

  try {
    // 1. Verifica status do pagamento no MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });
    const mpData = await mpRes.json();

    if (mpData.status !== 'approved') {
      return res.status(402).json({ error: 'Pagamento não aprovado', status: mpData.status });
    }

    // 2. Atualiza plano no Firestore via REST API
    const fbRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/usuarios/${uid}?updateMask.fieldPaths=plano&key=${FB_KEY}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { plano: { stringValue: 'premium' } }
        }),
      }
    );

    if (!fbRes.ok) {
      const err = await fbRes.json();
      return res.status(500).json({ error: 'Erro ao atualizar Firestore', detail: err });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

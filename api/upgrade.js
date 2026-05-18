export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, pagamentoId, idToken, planoAtual } = req.body;
  if (!uid || !pagamentoId || !idToken) {
    return res.status(400).json({ error: 'uid, pagamentoId e idToken obrigatórios' });
  }

  // Define plano destino baseado no plano atual do cliente
  const planoDestino = planoAtual === 'basico-anual' ? 'premium-anual' : 'premium';

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'Token MP não configurado' });

  try {
    // 1. Verifica pagamento no MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });
    const mpData = await mpRes.json();

    if (mpData.status !== 'approved') {
      return res.status(402).json({ error: 'Pagamento não aprovado', status: mpData.status });
    }

    // 2. Atualiza Firestore com idToken do usuário autenticado
    const fbRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/usuarios/${uid}?updateMask.fieldPaths=plano`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: { plano: { stringValue: planoDestino } }
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

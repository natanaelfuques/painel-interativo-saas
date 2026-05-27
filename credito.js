// api/credito.js
// Vercel Function: verifica pagamento aprovado no MP e adiciona 1 crédito ao usuário no Firestore
// Chamada pelo pix.html no polling (modoCredito) como fallback caso o update client-side falhe,
// ou futuramente via webhook do Mercado Pago.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, pagamentoId, idToken } = req.body;
  if (!uid || !pagamentoId || !idToken) {
    return res.status(400).json({ error: 'uid, pagamentoId e idToken obrigatórios' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'Token MP não configurado' });

  try {
    // 1. Verifica pagamento no Mercado Pago
    const mpRes  = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });
    const mpData = await mpRes.json();

    if (mpData.status !== 'approved') {
      return res.status(402).json({ error: 'Pagamento não aprovado', status: mpData.status });
    }

    // Determina plano a partir do metadata
    const tipo  = mpData.metadata?.tipo || 'credito-basico';
    const plano = tipo.includes('premium') ? 'premium' : 'basico';

    // 2. Verifica se já foi processado (idempotência)
    const FIREBASE_KEY = process.env.FIREBASE_API_KEY;
    const docUrl = `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/pagamentos_pendentes/${pagamentoId}?key=${FIREBASE_KEY}`;
    const checkRes = await fetch(docUrl);
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.fields?.status?.stringValue === 'concluido') {
        return res.status(200).json({ success: true, message: 'Já processado' });
      }
    }

    // 3. Registra a compra em creditos/{uid} — saldo já foi incrementado pelo client SDK (pix.html)
    // Aqui só atualizamos metadados e garantimos que o doc existe
    await fetch(
      `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/creditos/${uid}?updateMask.fieldPaths=ultimaCompraEm&updateMask.fieldPaths=plano`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: {
            plano:          { stringValue: plano },
            ultimaCompraEm: { timestampValue: new Date().toISOString() },
          },
        }),
      }
    );

    // 4. Marca pagamento como concluído
    if (FIREBASE_KEY) {
      await fetch(
        `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/pagamentos_pendentes/${pagamentoId}?updateMask.fieldPaths=status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { status: { stringValue: 'concluido' } },
          }),
        }
      );
    }

    return res.status(200).json({ success: true, plano });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID obrigatório' });

  const ACCESS_TOKEN  = process.env.MP_ACCESS_TOKEN;
  const FIREBASE_KEY  = process.env.FIREBASE_API_KEY;
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'Token não configurado' });

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });

    const data = await response.json();
    const status = data.status;

    // Se aprovado, salva no Firestore via REST (sem SDK, funciona em Edge/Vercel)
    if (status === 'approved' && FIREBASE_KEY) {
      const meta = data.metadata || {};
      const nome     = meta.nome     || '';
      const email    = meta.email    || '';
      const telefone = meta.telefone || '';
      const plano    = meta.plano    || 'mensal';

      // Só salva se ainda não existir (evita duplicar em múltiplas chamadas)
      const docUrl = `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/pagamentos_pendentes/${id}?key=${FIREBASE_KEY}`;
      const checkRes = await fetch(docUrl);

      if (!checkRes.ok) {
        // Documento não existe — cria
        await fetch(
          `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/pagamentos_pendentes?documentId=${id}&key=${FIREBASE_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                nome:      { stringValue: nome },
                email:     { stringValue: email },
                telefone:  { stringValue: telefone },
                plano:     { stringValue: plano },
                status:    { stringValue: 'pendente_cadastro' },
                criadoEm:  { timestampValue: new Date().toISOString() },
              }
            })
          }
        );
      }
    }

    return res.status(200).json({ status });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

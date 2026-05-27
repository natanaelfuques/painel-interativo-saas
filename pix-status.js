export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID obrigatório' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const FIREBASE_KEY = process.env.FIREBASE_API_KEY;
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'Token não configurado' });

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });

    const data   = await response.json();
    const status = data.status;

    // Se aprovado, salva registro no Firestore via REST
    if (status === 'approved' && FIREBASE_KEY) {
      const meta     = data.metadata || {};
      const nome     = meta.nome      || '';
      const email    = meta.email     || '';
      const telefone = meta.telefone  || '';
      const tipo     = meta.tipo      || 'onboarding-basico'; // 'onboarding-basico' | 'onboarding-premium' | 'credito-basico' | 'credito-premium'
      const uid      = meta.uid       || null; // presente só em compras de crédito avulso

      // Plano derivado do tipo
      const plano = tipo.includes('premium') ? 'premium' : 'basico';

      // Só salva se ainda não existir (evita duplicar em múltiplos polls)
      const docUrl = `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/pagamentos_pendentes/${id}?key=${FIREBASE_KEY}`;
      const checkRes = await fetch(docUrl);

      if (!checkRes.ok) {
        // Documento não existe — cria
        const campos = {
          nome:      { stringValue: nome },
          email:     { stringValue: email },
          telefone:  { stringValue: telefone },
          tipo:      { stringValue: tipo },      // novo campo: tipo do pagamento
          plano:     { stringValue: plano },     // 'basico' ou 'premium'
          status:    { stringValue: tipo.startsWith('onboarding') ? 'pendente_cadastro' : 'pendente_credito' },
          criadoEm:  { timestampValue: new Date().toISOString() },
        };

        // Se for crédito avulso (cliente já cadastrado), inclui uid
        if (uid) campos.uid = { stringValue: uid };

        await fetch(
          `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/pagamentos_pendentes?documentId=${id}&key=${FIREBASE_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: campos }),
          }
        );
      }
    }

    return res.status(200).json({ status });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nome, email, telefone, tipo, uid } = req.body;
  // tipo: 'onboarding-basico' | 'onboarding-premium' | 'credito-basico' | 'credito-premium'

  if (!nome || !email || !telefone || !tipo) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, email, telefone, tipo' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Token não configurado' });
  }

  // Valores e descrições padrão — podem ser sobrescritos pelo Firestore (config/precos)
  const valoresPadrao = {
    'onboarding-basico':   49.90,
    'onboarding-premium':  69.90,
    'credito-basico':      49.90,
    'credito-premium':     69.90,
  };

  const descricoesPadrao = {
    'onboarding-basico':   'Painel Interativo — Acesso Básico + 1 Crédito',
    'onboarding-premium':  'Painel Interativo — Acesso Premium + 1 Crédito',
    'credito-basico':      'Painel Interativo — Crédito de Evento Básico',
    'credito-premium':     'Painel Interativo — Crédito de Evento Premium',
  };

  // Tenta buscar valores do Firestore (config/precos)
  let valores    = { ...valoresPadrao };
  let descricoes = { ...descricoesPadrao };
  try {
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
    const cfgRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/painel-interativo-saas/databases/(default)/documents/config/precos?key=${FIREBASE_API_KEY}`
    );
    if (cfgRes.ok) {
      const cfgData = await cfgRes.json();
      const fields  = cfgData.fields || {};
      if (fields.valores?.mapValue?.fields) {
        const v = fields.valores.mapValue.fields;
        Object.entries(v).forEach(([k, val]) => {
          valores[k] = parseFloat(val.doubleValue || val.integerValue || 0);
        });
      }
      if (fields.descricoes?.mapValue?.fields) {
        const d = fields.descricoes.mapValue.fields;
        Object.entries(d).forEach(([k, val]) => {
          descricoes[k] = val.stringValue || '';
        });
      }
    }
  } catch(e) { /* usa fallback */ }

  const valor     = valores[tipo]     ?? valoresPadrao[tipo]     ?? 49.90;
  const descricao = descricoes[tipo]  ?? descricoesPadrao[tipo]  ?? 'Painel Interativo';

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization':    `Bearer ${ACCESS_TOKEN}`,
        'Content-Type':     'application/json',
        'X-Idempotency-Key': `${email}-${tipo}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description:        descricao,
        payment_method_id:  'pix',
        payer: {
          email,
          first_name: nome.split(' ')[0],
          last_name:  nome.split(' ').slice(1).join(' ') || nome,
          identification: { type: 'CPF', number: '00000000000' },
        },
        metadata: { telefone, nome, email, tipo, uid: uid || null },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Erro no MP', detail: data });
    }

    return res.status(200).json({
      id:             data.id,
      status:         data.status,
      qr_code:        data.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
      expiracao:      data.date_of_expiration,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

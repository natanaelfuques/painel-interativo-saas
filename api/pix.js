export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nome, email, telefone, plano } = req.body;

  if (!nome || !email || !telefone) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, email, telefone' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Token não configurado' });
  }

  const valores = {
    basico:          289.99,
    'basico-anual':  2989.99,
    premium:         389.99,
    'premium-anual': 3989.99,
    upgrade:         100.00,
  };
  const descricoes = {
    basico:          'Painel Interativo — Plano Básico Mensal',
    'basico-anual':  'Painel Interativo — Plano Básico Anual',
    premium:         'Painel Interativo — Plano Premium Mensal',
    'premium-anual': 'Painel Interativo — Plano Premium Anual',
    upgrade:         'Painel Interativo — Upgrade para Premium',
  };

  const valor     = valores[plano]    || valores.basico;
  const descricao = descricoes[plano] || descricoes.basico;

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${email}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description: descricao,
        payment_method_id: 'pix',
        payer: {
          email,
          first_name: nome.split(' ')[0],
          last_name: nome.split(' ').slice(1).join(' ') || nome,
          identification: { type: 'CPF', number: '00000000000' },
        },
        metadata: { telefone, nome, email, plano },
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

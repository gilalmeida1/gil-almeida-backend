// server.js - Backend FINAL para mercadopago v2.x
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 Iniciando servidor Gil Almeida Arte...');

// Configurar Mercado Pago (SDK v2.x)
let mpClient = null;
if (process.env.MP_ACCESS_TOKEN) {
    mpClient = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN
    });
    console.log('✅ Mercado Pago configurado');
} else {
    console.error('❌ MP_ACCESS_TOKEN não configurado!');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Log simples
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// Health check (para o cron-job)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({ status: 'online', service: 'gil-almeida-backend' });
});

// ==========================================
// 🃏 CARTÃO
// ==========================================
app.post('/api/create-card-payment', async (req, res) => {
    try {
        const { valor, descricao, nome, email, cpf, token, installments } = req.body;
        
        console.log('📝 Processando cartão:', { valor, descricao, token: token?.substring(0,10)+'...' });
        
        if (!token) {
            throw new Error('Token do cartão não fornecido');
        }
        
        if (!mpClient) {
            throw new Error('Mercado Pago não configurado');
        }
        
        const payment = new Payment(mpClient);
        const result = await payment.create({
            body: {
                transaction_amount: parseFloat(valor),
                description: descricao || 'Compra Gil Almeida Arte',
                payment_method_id: 'visa',
                token: token,
                installments: installments || 1,
                payer: {
                    email: email || 'cliente@email.com',
                    first_name: nome || 'Cliente',
                    identification: cpf ? { type: 'CPF', number: cpf.replace(/\D/g, '') } : undefined
                }
            }
        });
        
        console.log('✅ Pagamento criado:', result.id, result.status);
        
        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            approved: result.status === 'approved'
        });
        
    } catch (error) {
        console.error('❌ Erro no pagamento:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Erro ao processar pagamento'
        });
    }
});

// ==========================================
// 📱 PIX
// ==========================================
app.post('/api/create-pix-payment', async (req, res) => {
    try {
        console.log('📱 Recebido pagamento PIX');
        const { valor, descricao, email, cpf } = req.body;

        if (!valor || valor <= 0) {
            return res.status(400).json({ success: false, error: 'Valor inválido' });
        }

        if (!mpClient) {
            throw new Error('Mercado Pago não configurado');
        }

        const payment = new Payment(mpClient);
        const result = await payment.create({
            body: {
                transaction_amount: parseFloat(valor),
                description: descricao || 'Compra Gil Almeida Arte',
                payment_method_id: 'pix',
                payer: {
                    email: email || 'cliente@email.com',
                    identification: { type: 'CPF', number: cpf?.replace(/\D/g, '') || '00000000000' }
                }
            }
        });

        const pixData = result.point_of_interaction?.transaction_data || {};

        console.log('✅ PIX gerado');
        return res.json({
            success: true,
            payment_id: result.id,
            qr_code_base64: pixData.qr_code_base64,
            qr_code: pixData.qr_code,
            status: result.status
        });
    } catch (error) {
        console.error('❌ ERRO PIX:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 📄 STATUS
// ==========================================
app.get('/api/check-payment/:paymentId', async (req, res) => {
    try {
        if (!mpClient) {
            throw new Error('Mercado Pago não configurado');
        }

        const payment = new Payment(mpClient);
        const result = await payment.get({ id: req.params.paymentId });
        
        return res.json({
            payment_id: req.params.paymentId,
            status: result.status,
            approved: result.status === 'approved'
        });
    } catch (error) {
        console.error('❌ Erro check:', error.message);
        return res.status(500).json({ success: false, error: 'Erro ao consultar' });
    }
});

// ==========================================
// 🎫 BOLETO (via Preference)
// ==========================================
app.post('/api/create-preference', async (req, res) => {
    try {
        console.log('🎫 Recebido boleto');
        const { valor, descricao, email, nome, pedidoId } = req.body;

        if (!valor || valor <= 0) {
            return res.status(400).json({ success: false, error: 'Valor inválido' });
        }

        if (!mpClient) {
            throw new Error('Mercado Pago não configurado');
        }

        const preference = new Preference(mpClient);
        const result = await preference.create({
            body: {
                items: [{
                    id: pedidoId || Date.now().toString(),
                    title: descricao || 'Compra Gil Almeida Arte',
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: parseFloat(valor)
                }],
                payer: {
                    email: email || 'cliente@email.com',
                    name: nome || 'Cliente'
                },
                back_urls: {
                    success: `https://gilalmeidaarte.com.br/meus-pedidos.html?payment_status=approved&external_reference=${pedidoId}`,
                    failure: 'https://gilalmeidaarte.com.br/precos.html',
                    pending: 'https://gilalmeidaarte.com.br/precos.html'
                },
                auto_return: 'approved',
                external_reference: pedidoId || Date.now().toString()
            }
        });
        
        console.log('✅ Preferência criada:', result.id);

        return res.json({
            success: true,
            preference_id: result.id,
            init_point: result.init_point,
            boleto_url: result.init_point,
            redirect: true
        });
    } catch (error) {
        console.error('❌ ERRO BOLETO:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Webhook
app.post('/webhook/mercadopago', (req, res) => {
    console.log('🔔 Webhook:', req.body);
    res.status(200).send('OK');
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
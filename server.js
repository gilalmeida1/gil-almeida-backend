// server.js - Backend FINAL (mercadopago@1.5.17)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 Iniciando servidor Gil Almeida Arte...');

// Configurar Mercado Pago (SDK v1.5.17)
if (process.env.MP_ACCESS_TOKEN) {
    mercadopago.configure({
        access_token: process.env.MP_ACCESS_TOKEN
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

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'online', service: 'gil-almeida-backend' });
});

// ==========================================
// 🃏 CARTÃO
// ==========================================
app.post('/api/create-card-payment', async (req, res) => {
    console.log('💳 Recebido pagamento com cartão');
    const { valor, descricao, nome, email, cpf, token, installments } = req.body;

    if (!token) return res.status(400).json({ success: false, error: 'Token obrigatório' });
    if (!valor || valor <= 0) return res.status(400).json({ success: false, error: 'Valor inválido' });

    try {
        const payment_data = {
            transaction_amount: parseFloat(valor),
            description: descricao || 'Compra Gil Almeida Arte',
            payment_method_id: 'master',
            token: token,
            installments: parseInt(installments) || 1,
            statement_descriptor: 'GIL ALMEIDA ARTE',
            payer: {
                email: email || 'cliente@email.com',
                identification: {
                    type: 'CPF',
                    number: cpf?.replace(/\D/g, '') || '00000000000'
                }
            },
            metadata: { customer_name: nome },
            capture: true
        };

        const payment = await mercadopago.payment.save(payment_data);
        const status = payment.response.status;

        console.log(`✅ MP respondeu: ${status}`);

        if (status === 'approved' || status === 'pending') {
            return res.json({
                success: true,
                approved: status === 'approved',
                payment_id: payment.response.id,
                status: status
            });
        } else {
            return res.json({
                success: false,
                approved: false,
                payment_id: payment.response.id,
                status: status,
                error: payment.response.status_detail || 'Não aprovado'
            });
        }
    } catch (error) {
        console.error('❌ ERRO:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 📱 PIX
// ==========================================
app.post('/api/create-pix-payment', async (req, res) => {
    console.log('📱 Recebido pagamento PIX');
    const { valor, descricao, email, cpf } = req.body;

    if (!valor || valor <= 0) return res.status(400).json({ success: false, error: 'Valor inválido' });

    try {
        const payment_data = {
            transaction_amount: parseFloat(valor),
            description: descricao || 'Compra Gil Almeida Arte',
            payment_method_id: 'pix',
            payer: {
                email: email || 'cliente@email.com',
                identification: { type: 'CPF', number: cpf?.replace(/\D/g, '') || '00000000000' }
            }
        };

        const payment = await mercadopago.payment.save(payment_data);
        const pixData = payment.response.point_of_interaction?.transaction_data || {};

        console.log('✅ PIX gerado');
        return res.json({
            success: true,
            payment_id: payment.response.id,
            qr_code_base64: pixData.qr_code_base64,
            qr_code: pixData.qr_code,
            status: payment.response.status
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
        const payment = await mercadopago.payment.get(req.params.paymentId);
        return res.json({
            payment_id: req.params.paymentId,
            status: payment.response.status,
            approved: payment.response.status === 'approved'
        });
    } catch (error) {
        console.error('❌ Erro check:', error.message);
        return res.status(500).json({ success: false, error: 'Erro ao consultar' });
    }
});

// ==========================================
// 🎫 BOLETO
// ==========================================
app.post('/api/create-preference', async (req, res) => {
    console.log('🎫 Recebido boleto');
    const { valor, descricao, email, cpf } = req.body;

    if (!valor || valor <= 0) return res.status(400).json({ success: false, error: 'Valor inválido' });

    try {
        const payment_data = {
            transaction_amount: parseFloat(valor),
            description: descricao || 'Compra Gil Almeida Arte',
            payment_method_id: 'bolbradesco',
            payer: {
                email: email || 'cliente@email.com',
                identification: { type: 'CPF', number: cpf?.replace(/\D/g, '') || '00000000000' },
                address: {
                    zip_code: '72220270',
                    street_name: 'QNN 8 Conjunto F',
                    street_number: '47',
                    neighborhood: 'Ceilândia Sul',
                    city: 'Brasília',
                    federal_unit: 'DF'
                }
            }
        };

        const payment = await mercadopago.payment.save(payment_data);
        console.log('✅ Boleto gerado');

        return res.json({
            success: true,
            payment_id: payment.response.id,
            boleto_url: payment.response.external_resource_url,
            status: payment.response.status,
            redirect: false
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

// Iniciar
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
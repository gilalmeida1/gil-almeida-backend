// server.js - Backend FINAL CORRIGIDO
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 Iniciando servidor Gil Almeida Arte...');

// Configurar Mercado Pago (SDK v2.x)
let client = null;
if (process.env.MP_ACCESS_TOKEN) {
    mercadopago.configure({
        access_token: process.env.MP_ACCESS_TOKEN
    });
    client = mercadopago;
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
    try {
        const { valor, descricao, nome, email, cpf, token, installments } = req.body;
        
        console.log('📝 Processando cartão:', { valor, descricao, token: token?.substring(0,10)+'...' });
        
        if (!token) {
            throw new Error('Token do cartão não fornecido');
        }
        
        if (!client) {
            throw new Error('Cliente Mercado Pago não inicializado');
        }
        
        const paymentData = {
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
        };
        
        const result = await client.payment.create(paymentData);
        
        console.log('✅ Pagamento criado:', result.body.id, result.body.status);
        
        res.json({
            success: true,
            payment_id: result.body.id,
            status: result.body.status,
            approved: result.body.status === 'approved'
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

        if (!client) {
            throw new Error('Cliente Mercado Pago não inicializado');
        }

        const paymentData = {
            transaction_amount: parseFloat(valor),
            description: descricao || 'Compra Gil Almeida Arte',
            payment_method_id: 'pix',
            payer: {
                email: email || 'cliente@email.com',
                identification: { type: 'CPF', number: cpf?.replace(/\D/g, '') || '00000000000' }
            }
        };

        const result = await client.payment.create(paymentData);
        const pixData = result.body.point_of_interaction?.transaction_data || {};

        console.log('✅ PIX gerado');
        return res.json({
            success: true,
            payment_id: result.body.id,
            qr_code_base64: pixData.qr_code_base64,
            qr_code: pixData.qr_code,
            status: result.body.status
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
        if (!client) {
            throw new Error('Cliente Mercado Pago não inicializado');
        }

        const result = await client.payment.get(req.params.paymentId);
        
        return res.json({
            payment_id: req.params.paymentId,
            status: result.body.status,
            approved: result.body.status === 'approved'
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
    try {
        console.log('🎫 Recebido boleto');
        const { valor, descricao, email, cpf } = req.body;

        if (!valor || valor <= 0) {
            return res.status(400).json({ success: false, error: 'Valor inválido' });
        }

        if (!client) {
            throw new Error('Cliente Mercado Pago não inicializado');
        }

        const paymentData = {
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
        
        const result = await client.payment.create(paymentData);
        
        console.log('✅ Boleto gerado');

        return res.json({
            success: true,
            payment_id: result.body.id,
            boleto_url: result.body.external_resource_url,
            status: result.body.status,
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

// ===== ENDPOINT PARA CRON-JOB (HEALTH CHECK) =====
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Iniciar
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
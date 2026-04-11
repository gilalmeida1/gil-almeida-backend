// server.js - Backend FINAL para Gil Almeida Arte (SDK v2)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
// SDK v2: importar a classe Mercadopago
const { Mercadopago } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 Iniciando servidor Gil Almeida Arte...');
console.log('🔑 MP_ACCESS_TOKEN:', process.env.MP_ACCESS_TOKEN ? '✅ Configurado' : '❌ NÃO CONFIGURADO');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Log de requisições
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    if (req.method === 'POST') {
        console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// ✅ SDK v2: criar instância do cliente (NÃO usa configure())
const mpClient = process.env.MP_ACCESS_TOKEN 
    ? new Mercadopago(process.env.MP_ACCESS_TOKEN) 
    : null;

if (mpClient) {
    console.log('✅ Cliente Mercado Pago v2 inicializado');
}

// Health check
app.get('/', (req, res) => {
    res.json({ 
        message: 'API Gil Almeida Arte OK!',
        timestamp: new Date().toISOString()
    });
});

// ==========================================
// 🃏 PAGAMENTO COM CARTÃO (SDK v2)
// ==========================================
app.post('/api/create-card-payment', async (req, res) => {
    console.log('\n========== CARTÃO ==========');
    const { valor, descricao, nome, email, cpf, token, installments, pedidoId } = req.body;

    if (!token) return res.status(400).json({ success: false, error: 'Token obrigatório' });
    if (!valor || valor <= 0) return res.status(400).json({ success: false, error: 'Valor inválido' });
    if (!descricao) return res.status(400).json({ success: false, error: 'Descrição obrigatória' });

    try {
        // ✅ SDK v2: estrutura do payment.create()
        const payment_data = {
            transaction_amount: parseFloat(valor),
            description: descricao,
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
            metadata: { 
                order_id: pedidoId || null,
                customer_name: nome 
            },
            capture: true,
            binary_mode: true
        };

        console.log('💳 Enviando para MP:', { valor: payment_data.transaction_amount });
        
        // ✅ SDK v2: usar mpClient.payment.create() (não .save())
        const payment = await mpClient.payment.create(payment_data);
        console.log('✅ MP respondeu:', payment.body.status);

        if (payment.body.status === 'approved' || payment.body.status === 'pending') {
            return res.json({
                success: true,
                approved: payment.body.status === 'approved',
                payment_id: payment.body.id,
                status: payment.body.status
            });
        } else {
            return res.json({
                success: false,
                approved: false,
                payment_id: payment.body.id,
                status: payment.body.status,
                error: payment.body.status_detail || 'Não aprovado'
            });
        }
    } catch (error) {
        console.error('❌ ERRO CARTÃO:', error.message);
        console.error('Detalhes:', error.cause || error.response?.body);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 📱 PIX (SDK v2)
// ==========================================
app.post('/api/create-pix-payment', async (req, res) => {
    console.log('\n========== PIX ==========');
    const { valor, descricao, nome, email, cpf } = req.body;
    
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

        const payment = await mpClient.payment.create(payment_data);
        const pixData = payment.body.point_of_interaction?.transaction_data || {};
        
        console.log('✅ PIX gerado');
        return res.json({
            success: true,
            payment_id: payment.body.id,
            qr_code_base64: pixData.qr_code_base64,
            qr_code: pixData.qr_code,
            status: payment.body.status
        });
    } catch (error) {
        console.error('❌ ERRO PIX:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 📄 VERIFICAR STATUS
// ==========================================
app.get('/api/check-payment/:paymentId', async (req, res) => {
    try {
        const payment = await mpClient.payment.get(req.params.paymentId);
        return res.json({
            payment_id: req.params.paymentId,
            status: payment.body.status,
            approved: payment.body.status === 'approved'
        });
    } catch (error) {
        console.error('❌ Erro check:', error.message);
        return res.status(500).json({ success: false, error: 'Erro ao consultar' });
    }
});

// ==========================================
// 🎫 BOLETO (SDK v2)
// ==========================================
app.post('/api/create-preference', async (req, res) => {
    console.log('\n========== BOLETO ==========');
    const { valor, descricao, nome, email, cpf, pedidoId } = req.body;
    
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
            },
            metadata: { order_id: pedidoId || null }
        };

        const payment = await mpClient.payment.create(payment_data);
        console.log('✅ Boleto gerado');
        
        return res.json({
            success: true,
            payment_id: payment.body.id,
            boleto_url: payment.body.external_resource_url,
            status: payment.body.status,
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

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 URL: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}`);
});
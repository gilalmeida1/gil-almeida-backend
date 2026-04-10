import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

// ===== ENDPOINT: Criar pagamento PIX =====
app.post('/api/create-pix-payment', async (req, res) => {
    try {
        const { valor, descricao, nome, email, cpf } = req.body;
        
        const payment = new Payment(client);
        
        const paymentData = {
            transaction_amount: valor,
            description: descricao,
            payment_method_id: 'pix',
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            payer: {
                email: email || 'cliente@email.com',
                first_name: nome || 'Cliente',
                identification: cpf ? {
                    type: 'CPF',
                    number: cpf
                } : undefined
            }
        };

        const result = await payment.create({ body: paymentData });
        
        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64,
            qr_code: result.point_of_interaction?.transaction_data?.qr_code,
            ticket_url: result.point_of_interaction?.transaction_data?.ticket_url
        });
        
    } catch (error) {
        console.error('Erro ao criar pagamento PIX:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao criar pagamento'
        });
    }
});

// ===== ENDPOINT: Criar pagamento com cartão (Checkout Transparente) =====
app.post('/api/create-card-payment', async (req, res) => {
    try {
        const { valor, descricao, nome, email, cpf, token, paymentMethodId, installments } = req.body;
        
        const payment = new Payment(client);
        
        const paymentData = {
            transaction_amount: valor,
            description: descricao,
            payment_method_id: paymentMethodId || 'visa',
            token: token,
            installments: installments || 1,
            payer: {
                email: email || 'cliente@email.com',
                first_name: nome || 'Cliente',
                identification: cpf ? {
                    type: 'CPF',
                    number: cpf
                } : undefined
            }
        };

        const result = await payment.create({ body: paymentData });
        
        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            status_detail: result.status_detail
        });
        
    } catch (error) {
        console.error('Erro ao criar pagamento com cartão:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao criar pagamento'
        });
    }
});

// ===== ENDPOINT: Criar preferência de pagamento (Checkout Pro) =====
app.post('/api/create-preference', async (req, res) => {
    try {
        const { valor, descricao, nome, email, pedidoId } = req.body;
        
        const preference = new Preference(client);
        
        const preferenceData = {
            items: [
                {
                    id: pedidoId || crypto.randomUUID(),
                    title: descricao,
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: valor
                }
            ],
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
            payment_methods: {
                excluded_payment_types: [],
                installments: 12
            },
            external_reference: pedidoId || crypto.randomUUID()
        };

        const result = await preference.create({ body: preferenceData });
        
        res.json({
            success: true,
            preference_id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point
        });
        
    } catch (error) {
        console.error('Erro ao criar preferência:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao criar preferência'
        });
    }
});

// ===== ENDPOINT: Verificar status do pagamento =====
app.get('/api/check-payment/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        const payment = new Payment(client);
        const result = await payment.get({ id: paymentId });
        
        res.json({
            success: true,
            id: result.id,
            status: result.status,
            status_detail: result.status_detail,
            approved: result.status === 'approved'
        });
        
    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao verificar pagamento'
        });
    }
});

// ===== ENDPOINT: Webhook para receber notificações do Mercado Pago =====
app.post('/api/webhook', async (req, res) => {
    try {
        const { type, data, action } = req.body;
        
        console.log('Webhook recebido:', { type, action, data });
        
        // Se for uma notificação de pagamento
        if (type === 'payment') {
            const paymentId = data.id;
            
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: paymentId });
            
            console.log(`Pagamento ${paymentId} - Status: ${paymentInfo.status}`);
            
            // Aqui você pode atualizar o status do pedido no Firestore
            // Buscar o pedido pelo external_reference ou outro campo
        }
        
        res.status(200).json({ received: true });
        
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== ENDPOINT: Health check =====
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT}`);
});
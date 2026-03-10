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
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
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

// ===== ENDPOINT: Criar preferência de pagamento com cartão/boleto =====
app.post('/api/create-preference', async (req, res) => {
    try {
        const { valor, descricao, nome, email } = req.body;
        
        const preference = new Preference(client);
        
        const preferenceData = {
            items: [
                {
                    id: crypto.randomUUID(),
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
                success: 'https://gilalmeidaarte.com.br/sucesso.html',
                failure: 'https://gilalmeidaarte.com.br/falha.html',
                pending: 'https://gilalmeidaarte.com.br/pendente.html'
            },
            auto_return: 'approved',
            payment_methods: {
                excluded_payment_types: [],
                installments: 12
            },
            external_reference: crypto.randomUUID()
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT}`);
});
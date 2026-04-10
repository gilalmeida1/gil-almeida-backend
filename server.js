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

// Verificar se o token existe
if (!process.env.MP_ACCESS_TOKEN) {
    console.error('❌ MP_ACCESS_TOKEN não configurado!');
}

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

// ===== ENDPOINT: Criar pagamento com cartão =====
app.post('/api/create-card-payment', async (req, res) => {
    try {
        const { 
            valor, 
            descricao, 
            nome, 
            email, 
            cpf,
            cardNumber,
            cardExpiryMonth,
            cardExpiryYear,
            cardCvv,
            cardholderName,
            installments 
        } = req.body;
        
        console.log('📝 Recebendo pagamento:', { valor, descricao, nome, email });
        
        // Validar dados do cartão
        if (!cardNumber || !cardExpiryMonth || !cardExpiryYear || !cardCvv || !cardholderName) {
            throw new Error('Dados do cartão incompletos');
        }
        
        // Determinar a bandeira do cartão (simplificado)
        let paymentMethodId = 'visa';
        const firstDigit = cardNumber.toString().charAt(0);
        if (firstDigit === '5') paymentMethodId = 'master';
        else if (firstDigit === '3') paymentMethodId = 'amex';
        
        // Criar pagamento
        const payment = new Payment(client);
        
        const paymentData = {
            transaction_amount: parseFloat(valor),
            description: descricao,
            payment_method_id: paymentMethodId,
            installments: installments || 1,
            token: null, // Para Checkout Transparente, precisamos do token
            payer: {
                email: email || 'cliente@email.com',
                first_name: nome || 'Cliente',
                identification: cpf ? {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                } : undefined
            }
        };

        // Se temos todos os dados do cartão, usamos o método simplificado
        if (cardNumber && cardExpiryMonth && cardExpiryYear && cardCvv) {
            paymentData.card = {
                card_number: cardNumber.replace(/\s/g, ''),
                expiration_month: parseInt(cardExpiryMonth),
                expiration_year: parseInt(cardExpiryYear),
                security_code: cardCvv,
                cardholder: {
                    name: cardholderName,
                    identification: cpf ? {
                        type: 'CPF',
                        number: cpf.replace(/\D/g, '')
                    } : undefined
                }
            };
        }

        const result = await payment.create({ body: paymentData });
        
        console.log('✅ Pagamento criado:', result.id, result.status);
        
        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            status_detail: result.status_detail,
            approved: result.status === 'approved'
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar pagamento:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao criar pagamento'
        });
    }
});

// ===== ENDPOINT: Criar pagamento PIX =====
app.post('/api/create-pix-payment', async (req, res) => {
    try {
        const { valor, descricao, nome, email, cpf } = req.body;
        
        console.log('📝 Gerando PIX:', { valor, descricao });
        
        const payment = new Payment(client);
        
        const paymentData = {
            transaction_amount: parseFloat(valor),
            description: descricao,
            payment_method_id: 'pix',
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            payer: {
                email: email || 'cliente@email.com',
                first_name: nome || 'Cliente',
                identification: cpf ? {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                } : undefined
            }
        };

        const result = await payment.create({ body: paymentData });
        
        console.log('✅ PIX gerado:', result.id);
        
        res.json({
            success: true,
            payment_id: result.id,
            status: result.status,
            qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64,
            qr_code: result.point_of_interaction?.transaction_data?.qr_code,
            ticket_url: result.point_of_interaction?.transaction_data?.ticket_url
        });
        
    } catch (error) {
        console.error('❌ Erro PIX:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao criar pagamento PIX'
        });
    }
});

// ===== ENDPOINT: Criar preferência (Checkout Pro) =====
app.post('/api/create-preference', async (req, res) => {
    try {
        const { valor, descricao, nome, email, pedidoId } = req.body;
        
        console.log('📝 Criando preferência:', { valor, descricao, pedidoId });
        
        const preference = new Preference(client);
        
        const preferenceData = {
            items: [
                {
                    id: pedidoId || crypto.randomUUID(),
                    title: descricao,
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: parseFloat(valor)
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
            external_reference: pedidoId || crypto.randomUUID()
        };

        const result = await preference.create({ body: preferenceData });
        
        console.log('✅ Preferência criada:', result.id);
        
        res.json({
            success: true,
            preference_id: result.id,
            init_point: result.init_point
        });
        
    } catch (error) {
        console.error('❌ Erro preferência:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Erro ao criar preferência'
        });
    }
});

// ===== ENDPOINT: Verificar pagamento =====
app.get('/api/check-payment/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        const payment = new Payment(client);
        const result = await payment.get({ id: paymentId });
        
        res.json({
            success: true,
            id: result.id,
            status: result.status,
            approved: result.status === 'approved'
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===== ENDPOINT: Health check =====
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== ROTA RAIZ =====
app.get('/', (req, res) => {
    res.json({ message: 'API do Gil Almeida Arte funcionando!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT}`);
});
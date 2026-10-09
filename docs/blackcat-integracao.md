# Como conectar a API Pix da Blackcat

Este guia explica como colocar a integração com o gateway **Blackcat** no ar. O código
já está implementado no projeto; faltam apenas as suas credenciais e o cadastro do webhook.

## 1. Pegue a API Key no painel da Blackcat

1. Acesse o painel em https://app.blackcat.com.br/login
2. Vá em **API / Credenciais** e copie a **API Key** (`X-API-Key`).

## 2. Configure a variável de ambiente no Netlify

1. Abra https://app.netlify.com/projects/habilitacaobrasil → **Site configuration** → **Environment variables**
2. Crie a variável:

| Nome              | Valor                        |
|-------------------|------------------------------|
| `BLACKCAT_API_KEY`| a API Key copiada do painel  |

Opcionalmente, se a Blackcat mudar a base da API:

| Nome                | Valor                                        |
|---------------------|----------------------------------------------|
| `BLACKCAT_API_BASE` | `https://api.blackcatoficial.com/api` (padrão) |

> O escopo deve incluir **Runtime** (funções). Depois de salvar, faça um novo deploy
> (ou rodar "Clear cache and deploy site") para a variável valer nas funções.

## 3. Cadastre o webhook na Blackcat

O webhook (postback) é quem confirma o pagamento em tempo real. Cadastre no painel
da Blackcat (seção Webhooks) a URL abaixo, selecionando o evento `all` (ou ao menos
`transaction.paid` e `transaction.failed`):

```
https://habilitacaobrasil.netlify.app/api/blackcat/webhook
```

A URL também é enviada automaticamente em cada venda via campo `postbackUrl`.

## 4. Como funciona a integração (já implementada)

O site continua chamando os mesmos endpoints de antes — nada muda no frontend:

| Endpoint do site                        | O que faz                                                       |
|-----------------------------------------|-----------------------------------------------------------------|
| `POST /api/payment/payment.php`         | Cria cobrança Pix de R$ 95,60 (taxa principal)                  |
| `POST /api/payment/payment_second.php`  | Cria cobrança Pix de R$ 127,00 (exame médico)                   |
| `POST /api/payment/payment_fixo.php`    | Cria cobrança Pix (taxa fixa; usa `payment_type` do body)       |
| `GET /api/payment/status/status.php?id=…` | Consulta o status (`pending`/`paid`/`cancelled`) da transação |
| `POST /api/blackcat/webhook`            | Recebe o postback da Blackcat e atualiza o status               |

Fluxo:

1. O site envia nome, e-mail, telefone e CPF do cliente para o endpoint de pagamento.
2. A função `payment` chama `POST https://api.blackcatoficial.com/api/sales/create-sale`
   com header `X-API-Key`, valor em **centavos**, `paymentMethod: "pix"` e os dados do cliente.
3. A Blackcat devolve o **código Pix Copia e Cola** (`paymentData.copyPaste`) e o QR Code.
   A resposta é montada no formato que o site já espera (`pix_code`, `transaction_id`, `deposit_id`).
4. O site mostra o QR Code e faz polling em `/api/payment/status/status.php`.
   Enquanto o status local está pendente, a função consulta
   `GET /sales/{transactionId}/status` na Blackcat e atualiza o banco.
5. Quando o Pix cai, a Blackcat envia o webhook `transaction.paid` para
   `/api/blackcat/webhook`, que marca a venda como paga no banco.
6. O polling detecta `status: "paid"` e o site redireciona para `/success`.

Toda venda fica registrada na tabela `payments` (e os eventos na `webhook_events`)
no Netlify Database (Postgres). As tabelas são criadas automaticamente no deploy,
via migration em `netlify/database/migrations/`.

## 5. Testando

Sem a chave configurada, os endpoints respondem com erro claro:

```
{"success":false,"error":"BLACKCAT_API_KEY nao configurada"}
```

Depois de configurar a variável e publicar, um teste real:

```bash
curl -X POST https://habilitacaobrasil.netlify.app/api/payment/payment.php \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"Fulano de Tal","customer_email":"fulano@email.com","customer_phone":"11999999999","customer_cpf":"00000000000"}'
```

Resposta esperada: `{"success":true,"pix_code":"00020126...","transaction_id":"tx_..."}`.

Gere um QR Code com o `pix_code` e pague com valor pequeno de teste para validar o
ciclo completo (criação → webhook → status `paid`).

## 6. Referência rápida da API Blackcat

- Base: `https://api.blackcatoficial.com/api`
- Autenticação: header `X-API-Key: <sua chave>`
- Criar venda Pix: `POST /sales/create-sale` (valores em centavos)
- Consultar status: `GET /sales/{transactionId}/status` → `PENDING | PAID | CANCELLED | REFUNDED`
- Webhooks: `POST` com headers `X-Webhook-Event` e `X-Webhook-Source: blackcat-api`;
  responda `200` em até 10s (a nossa função já faz isso)
- Documentação oficial: https://docs.blackcatoficial.com/

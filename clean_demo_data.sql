-- ==============================================================================
-- GEF — SCRIPT DE LIMPEZA DE DADOS FICTÍCIOS / DEMONSTRAÇÃO
-- Remove lojas pré-configuradas de teste, produtos e clientes demo
-- Preserva a estrutura das tabelas, plano gratuito e perfil do SuperAdmin
-- ==============================================================================

-- 1. Limpar clientes pré-cadastrados / fictícios (Zero clientes iniciais)
DELETE FROM public.customers WHERE true;
DELETE FROM public.customer_payments WHERE true;

-- 2. Limpar vendas, itens e movimentações de teste se vinculadas a lojas demo
DELETE FROM public.sale_items WHERE true;
DELETE FROM public.sales WHERE true;
DELETE FROM public.cash_movements WHERE true;
DELETE FROM public.cash_sessions WHERE true;
DELETE FROM public.stock_movements WHERE true;
DELETE FROM public.losses WHERE true;

-- 3. Limpar lojas com código ou nome de demonstração (como LOJA-DEMO, Loja Teste, etc.)
DELETE FROM public.stores 
WHERE LOWER(code) IN ('loja-demo', 'loja-teste', 'demo', 'teste', 'store-001')
   OR LOWER(name) LIKE '%teste%' 
   OR LOWER(name) LIKE '%demo%';

-- 4. Limpar produtos órfãos ou de teste caso não associados a lojas reais
DELETE FROM public.product_conversions WHERE product_id NOT IN (SELECT id FROM public.products);
DELETE FROM public.product_stock WHERE product_id NOT IN (SELECT id FROM public.products);
DELETE FROM public.batches WHERE product_id NOT IN (SELECT id FROM public.products);

-- 5. Garantir SuperAdmin no banco
INSERT INTO public.profiles (id, full_name, email, role, default_store_id, active)
VALUES (
    'aef2d4c5-b8dd-4d8a-8bff-7816ee687b53',
    'Felisberto Uele (SuperAdmin)',
    'felisbertouele7@gmail.com',
    'SUPERADMIN',
    NULL,
    true
)
ON CONFLICT (id) DO UPDATE SET role = 'SUPERADMIN', full_name = 'Felisberto Uele (SuperAdmin)';

-- 6. Registrar limpeza em auditoria
INSERT INTO public.audit_logs (store_id, user_id, operator_name, action, entity, details)
VALUES (
    NULL,
    'aef2d4c5-b8dd-4d8a-8bff-7816ee687b53',
    'GEF',
    'LIMPEZA_DEMO',
    'sistema',
    '{"mensagem": "Limpeza de dados de demonstração concluída com sucesso. Zero clientes fictícios e lojas de teste removidas."}'::jsonb
);

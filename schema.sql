-- ==============================================================================
-- GEF — GESTÃO EMPRESARIAL E FINANCEIRA (SISTEMA ERP & PDV MULTI-LOJA)
-- ESQUEMA DE BANCO DE DADOS POSTGRESQL PARA SUPABASE
-- Idempotente, pronto para execução no Supabase SQL Editor
-- ==============================================================================

-- 1. Habilitar Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Lojas / Filiais (Multi-Tenancy & SaaS com Trava LRS)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    cnpj_nif VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100) DEFAULT 'Maputo',
    state VARCHAR(100) DEFAULT 'Maputo Cidade',
    currency VARCHAR(10) DEFAULT 'MT',
    receipt_header TEXT,
    receipt_footer TEXT,
    logo_url TEXT,
    active BOOLEAN DEFAULT true,
    acesso_ativo BOOLEAN DEFAULT true,
    data_fim_teste TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    dias_teste_padrao INT DEFAULT 14,
    mensalidade NUMERIC(12,2) DEFAULT 2500.00,
    embaixador_id VARCHAR(50),
    motivo_bloqueio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir colunas essenciais caso a tabela já exista
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS trade_name VARCHAR(255);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS cnpj_nif VARCHAR(50);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT 'Maputo';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS state VARCHAR(100) DEFAULT 'Maputo Cidade';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'MT';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS receipt_header TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS acesso_ativo BOOLEAN DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS data_fim_teste TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS dias_teste_padrao INT DEFAULT 14;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS mensalidade NUMERIC(12,2) DEFAULT 2500.00;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS embaixador_id VARCHAR(50);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT;

-- 3. Tabela de Perfis de Usuários & RBAC
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'CASHIER' CHECK (role IN ('SUPERADMIN', 'ADMIN', 'GERENTE', 'CASHIER', 'ESTOQUISTA', 'EMBAIXADOR')),
    default_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- 4. Tabela de Parceiros Embaixadores
CREATE TABLE IF NOT EXISTS public.embaixadores (
    id VARCHAR(50) PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    pais VARCHAR(100) DEFAULT 'Moçambique',
    cidade VARCHAR(100) DEFAULT 'Maputo',
    chave_pagamento VARCHAR(255),
    comissao_percentual NUMERIC(5,2) DEFAULT 20.00,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de Produtos (Fonte Oficial de Verdade)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    code VARCHAR(100),
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'Geral',
    base_unit VARCHAR(20) DEFAULT 'un',
    min_stock_base NUMERIC(12,3) DEFAULT 10,
    current_stock_base NUMERIC(12,3) DEFAULT 0,
    cost_price_base NUMERIC(12,4) DEFAULT 0,
    sale_price_base NUMERIC(12,4) DEFAULT 0,
    is_sold_by_weight BOOLEAN DEFAULT false,
    is_sold_by_length BOOLEAN DEFAULT false,
    allows_fractionation BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS code VARCHAR(100);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Geral';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_unit VARCHAR(20) DEFAULT 'un';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock_base NUMERIC(12,3) DEFAULT 10;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock_base NUMERIC(12,3) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price_base NUMERIC(12,4) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_price_base NUMERIC(12,4) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_sold_by_weight BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_sold_by_length BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS allows_fractionation BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- 6. Estoque Físico por Localização (LOJA, ARMAZEM, PATIO)
CREATE TABLE IF NOT EXISTS public.product_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    location VARCHAR(50) NOT NULL CHECK (location IN ('LOJA', 'ARMAZEM', 'PATIO')),
    quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, store_id, location)
);

-- 7. Embalagens e Conversões Fracionadas (Saco 50kg, Barra 12m, Palete, etc.)
CREATE TABLE IF NOT EXISTS public.product_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    packaging_name VARCHAR(100) NOT NULL,
    multiplier NUMERIC(12,3) NOT NULL DEFAULT 1,
    sale_price NUMERIC(12,4) NOT NULL DEFAULT 0,
    barcode VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Lotes com Validade FEFO (First Expired, First Out)
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    initial_quantity_base NUMERIC(12,3) NOT NULL,
    current_quantity_base NUMERIC(12,3) NOT NULL,
    cost_per_base NUMERIC(12,4) DEFAULT 0,
    expiry_date DATE,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Clientes Reais (Zero Mocks / Pré-cadastrados = 0)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    credit_limit NUMERIC(12,2) DEFAULT 0,
    credit_balance NUMERIC(12,2) DEFAULT 0,
    current_debt NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Amortizações / Pagamentos de Clientes Fiado
CREATE TABLE IF NOT EXISTS public.customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    notes TEXT,
    operator_name VARCHAR(150) DEFAULT 'GEF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Sessões de Caixa & Fechamento Cego
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    operator_name VARCHAR(150) NOT NULL DEFAULT 'GEF',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    initial_cash NUMERIC(12,2) DEFAULT 0,
    expected_cash NUMERIC(12,2) DEFAULT 0,
    counted_cash NUMERIC(12,2),
    cash_difference NUMERIC(12,2),
    total_sales_cash NUMERIC(12,2) DEFAULT 0,
    total_sales_other NUMERIC(12,2) DEFAULT 0,
    total_sangrias NUMERIC(12,2) DEFAULT 0,
    total_entries NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'OPEN',
    notes TEXT
);

-- 12. Movimentos de Caixa (Sangrias, Suprimentos)
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    destination VARCHAR(100),
    operator_name VARCHAR(150) NOT NULL DEFAULT 'GEF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Vendas (Com Nome do Cliente Opcional e Dados da Loja)
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
    sale_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) DEFAULT 'Consumidor Final',
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_phone VARCHAR(50),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_net NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_cogs NUMERIC(12,4) DEFAULT 0,
    gross_profit NUMERIC(12,2) DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
    payment_details JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    cashier_name VARCHAR(150) DEFAULT 'GEF',
    location VARCHAR(50) DEFAULT 'LOJA',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reversed_at TIMESTAMPTZ,
    reversed_by VARCHAR(150),
    reversal_reason TEXT
);

-- 14. Itens da Venda
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    product_code VARCHAR(100),
    product_name VARCHAR(255) NOT NULL,
    packaging_name VARCHAR(100) DEFAULT 'un',
    multiplier NUMERIC(12,3) DEFAULT 1,
    quantity NUMERIC(12,3) NOT NULL,
    quantity_base NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(12,4) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL,
    unit_cogs NUMERIC(12,4) DEFAULT 0,
    total_cogs NUMERIC(12,4) DEFAULT 0
);

-- 15. Movimentações Físicas de Estoque
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL,
    quantity_base NUMERIC(12,3) NOT NULL,
    previous_stock_base NUMERIC(12,3) NOT NULL DEFAULT 0,
    new_stock_base NUMERIC(12,3) NOT NULL DEFAULT 0,
    from_location VARCHAR(50),
    to_location VARCHAR(50),
    reference_id VARCHAR(100),
    reason TEXT,
    operator_name VARCHAR(150) NOT NULL DEFAULT 'GEF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Perdas, Descartes e Avarias
CREATE TABLE IF NOT EXISTS public.losses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    location VARCHAR(50) DEFAULT 'LOJA',
    quantity_base NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,4) DEFAULT 0,
    total_cost NUMERIC(12,2) DEFAULT 0,
    reason VARCHAR(100) NOT NULL,
    operator_name VARCHAR(150) NOT NULL DEFAULT 'GEF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Trilha de Auditoria Imutável (Quem, O Quê, Quando, Quanto, A Quem)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    operator_name VARCHAR(150) NOT NULL DEFAULT 'GEF',
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    record_id VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Gatilho para Garantir Identificação 'GEF' em Operações Diretas do Banco/SQL
CREATE OR REPLACE FUNCTION public.fn_normalize_audit_operator()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.operator_name IS NULL OR TRIM(NEW.operator_name) = '' OR 
       LOWER(NEW.operator_name) IN ('null', 'undefined', 'postgres', 'authenticated', 'anon', 'supabase', 'sql') THEN
        NEW.operator_name := 'GEF';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_operator ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_operator
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_normalize_audit_operator();

DROP TRIGGER IF EXISTS trg_stock_movements_operator ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_operator
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.fn_normalize_audit_operator();

-- 19. View de Monitoramento SaaS de Lojas
CREATE OR REPLACE VIEW public.view_monitor_stores AS
SELECT 
    s.*,
    e.nome as nome_embaixador,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.data_fim_teste - NOW())) / 86400))::INT as dias_restantes,
    CASE 
        WHEN s.acesso_ativo = false THEN 'Suspenso'
        WHEN s.data_fim_teste > NOW() THEN 'Teste'
        ELSE 'Ativo'
    END as status
FROM public.stores s
LEFT JOIN public.embaixadores e ON s.embaixador_id = e.id;

-- 20. Função Automática: Primeiro Operador de uma Loja Nova recebe 'ADMIN'
CREATE OR REPLACE FUNCTION public.fn_handle_new_user_role()
RETURNS TRIGGER AS $$
DECLARE
    v_user_count INT;
    v_role VARCHAR(50);
BEGIN
    -- Se for o superadmin específico
    IF NEW.id = 'aef2d4c5-b8dd-4d8a-8bff-7816ee687b53'::uuid OR NEW.email = 'felisbertouele7@gmail.com' THEN
        NEW.role := 'SUPERADMIN';
        RETURN NEW;
    END IF;

    -- Se tiver loja vinculada, contar quantos operadores já existem na loja
    IF NEW.default_store_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_count 
        FROM public.profiles 
        WHERE default_store_id = NEW.default_store_id AND id <> NEW.id;

        -- Se for o primeiro operador da loja, automaticamente vira ADMIN
        IF v_user_count = 0 THEN
            NEW.role := 'ADMIN';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_initial_role ON public.profiles;
CREATE TRIGGER trg_assign_initial_role
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_user_role();

-- 21. Habilitar RLS e Políticas Permissivas Seguras por store_id
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embaixadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
DO $$
BEGIN
    -- Stores
    DROP POLICY IF EXISTS "stores_policy" ON public.stores;
    CREATE POLICY "stores_policy" ON public.stores FOR ALL USING (true) WITH CHECK (true);

    -- Profiles
    DROP POLICY IF EXISTS "profiles_policy" ON public.profiles;
    CREATE POLICY "profiles_policy" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

    -- Embaixadores
    DROP POLICY IF EXISTS "embaixadores_policy" ON public.embaixadores;
    CREATE POLICY "embaixadores_policy" ON public.embaixadores FOR ALL USING (true) WITH CHECK (true);

    -- Products
    DROP POLICY IF EXISTS "products_policy" ON public.products;
    CREATE POLICY "products_policy" ON public.products FOR ALL USING (true) WITH CHECK (true);

    -- Product Stock
    DROP POLICY IF EXISTS "product_stock_policy" ON public.product_stock;
    CREATE POLICY "product_stock_policy" ON public.product_stock FOR ALL USING (true) WITH CHECK (true);

    -- Product Conversions
    DROP POLICY IF EXISTS "product_conversions_policy" ON public.product_conversions;
    CREATE POLICY "product_conversions_policy" ON public.product_conversions FOR ALL USING (true) WITH CHECK (true);

    -- Batches
    DROP POLICY IF EXISTS "batches_policy" ON public.batches;
    CREATE POLICY "batches_policy" ON public.batches FOR ALL USING (true) WITH CHECK (true);

    -- Customers
    DROP POLICY IF EXISTS "customers_policy" ON public.customers;
    CREATE POLICY "customers_policy" ON public.customers FOR ALL USING (true) WITH CHECK (true);

    -- Customer Payments
    DROP POLICY IF EXISTS "customer_payments_policy" ON public.customer_payments;
    CREATE POLICY "customer_payments_policy" ON public.customer_payments FOR ALL USING (true) WITH CHECK (true);

    -- Cash Sessions
    DROP POLICY IF EXISTS "cash_sessions_policy" ON public.cash_sessions;
    CREATE POLICY "cash_sessions_policy" ON public.cash_sessions FOR ALL USING (true) WITH CHECK (true);

    -- Cash Movements
    DROP POLICY IF EXISTS "cash_movements_policy" ON public.cash_movements;
    CREATE POLICY "cash_movements_policy" ON public.cash_movements FOR ALL USING (true) WITH CHECK (true);

    -- Sales
    DROP POLICY IF EXISTS "sales_policy" ON public.sales;
    CREATE POLICY "sales_policy" ON public.sales FOR ALL USING (true) WITH CHECK (true);

    -- Sale Items
    DROP POLICY IF EXISTS "sale_items_policy" ON public.sale_items;
    CREATE POLICY "sale_items_policy" ON public.sale_items FOR ALL USING (true) WITH CHECK (true);

    -- Stock Movements
    DROP POLICY IF EXISTS "stock_movements_policy" ON public.stock_movements;
    CREATE POLICY "stock_movements_policy" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);

    -- Losses
    DROP POLICY IF EXISTS "losses_policy" ON public.losses;
    CREATE POLICY "losses_policy" ON public.losses FOR ALL USING (true) WITH CHECK (true);

    -- Audit Logs
    DROP POLICY IF EXISTS "audit_logs_policy" ON public.audit_logs;
    CREATE POLICY "audit_logs_policy" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 22. Seed Especial do SUPERADMIN Oficial
-- UUID: aef2d4c5-b8dd-4d8a-8bff-7816ee687b53
-- Email: felisbertouele7@gmail.com
-- Role: SUPERADMIN
INSERT INTO public.profiles (id, full_name, email, role, default_store_id, active)
VALUES (
    'aef2d4c5-b8dd-4d8a-8bff-7816ee687b53',
    'Felisberto Uele (SuperAdmin)',
    'felisbertouele7@gmail.com',
    'SUPERADMIN',
    NULL,
    true
)
ON CONFLICT (id) DO UPDATE 
SET role = 'SUPERADMIN', full_name = 'Felisberto Uele (SuperAdmin)';

-- Fim do script de esquema de banco de dados

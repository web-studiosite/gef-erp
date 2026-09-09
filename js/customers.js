/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Clientes & Contas a Receber / Fiado (js/customers.js)
 * Requisito 16: Clientes Reais — Estado inicial: 0 clientes pré-cadastrados / Zero Mocks
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';

let customersCache = [];

/**
 * Consulta clientes reais no Supabase
 */
export async function fetchCustomers(storeIdParam = null) {
  const client = getSupabase();
  if (!client) return [];

  const storeId = storeIdParam || getCurrentStoreId();
  try {
    let query = client
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao consultar clientes no Supabase:', error);
      return [];
    }

    customersCache = (data || []).map(c => ({
      id: c.id,
      store_id: c.store_id,
      name: c.name,
      tax_id: c.tax_id || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      credit_limit: Number(c.credit_limit) || 0,
      current_debt: Number(c.current_debt || c.credit_balance || 0),
      notes: c.notes || '',
      active: c.active !== false
    }));

    return customersCache;
  } catch (err) {
    console.error('Erro de conexão ao buscar clientes:', err);
    return [];
  }
}

/**
 * Cadastra ou edita um cliente real no PostgreSQL
 */
export async function saveCustomer(customerData) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = customerData.store_id || getCurrentStoreId();
  if (!storeId || storeId === 'ALL') {
    throw new Error('Selecione uma loja específica antes de cadastrar clientes.');
  }

  const payload = {
    store_id: storeId,
    name: customerData.name?.trim(),
    tax_id: customerData.tax_id?.trim() || null,
    phone: customerData.phone?.trim() || null,
    email: customerData.email?.trim() || null,
    address: customerData.address?.trim() || null,
    credit_limit: Number(customerData.credit_limit) || 0,
    notes: customerData.notes?.trim() || null,
    active: true
  };

  let saved = null;
  if (customerData.id) {
    const { data, error } = await client
      .from('customers')
      .update(payload)
      .eq('id', customerData.id)
      .select()
      .single();
    if (error) throw new Error(formatErrorMessage(error));
    saved = data;
  } else {
    const { data, error } = await client
      .from('customers')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(formatErrorMessage(error));
    saved = data;
  }

  await client.from('audit_logs').insert({
    store_id: storeId,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: customerData.id ? 'ATUALIZACAO_CLIENTE' : 'CADASTRO_CLIENTE',
    entity: 'customers',
    record_id: saved.id,
    details: { nome: saved.name, limite: saved.credit_limit }
  });

  return saved;
}

/**
 * Registra um pagamento / amortização de dívida de cliente
 */
export async function registerCustomerPayment(customerId, amount, paymentMethod, notes) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = getCurrentStoreId();
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Informe um valor de pagamento válido.');
  }

  // 1. Obter cliente
  const { data: customer, error: fetchErr } = await client
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (fetchErr || !customer) throw new Error('Cliente não localizado.');

  const currentDebt = Number(customer.current_debt || 0);
  const newDebt = Math.max(0, currentDebt - numAmount);

  // 2. Abater saldo devedor
  await client
    .from('customers')
    .update({ current_debt: newDebt })
    .eq('id', customerId);

  // 3. Registrar na tabela de pagamentos
  await client.from('customer_payments').insert({
    store_id: storeId,
    customer_id: customerId,
    amount: numAmount,
    payment_method: paymentMethod || 'CASH',
    notes: notes || 'Amortização de conta no balcão',
    operator_name: user?.fullName || 'GEF'
  });

  // 4. Trilha de auditoria
  await client.from('audit_logs').insert({
    store_id: storeId,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: 'RECEBIMENTO_DIVIDA',
    entity: 'customers',
    record_id: customerId,
    details: {
      cliente: customer.name,
      valor_pago: numAmount,
      saldo_anterior: currentDebt,
      saldo_restante: newDebt,
      forma_pagamento: paymentMethod
    }
  });

  return true;
}

/**
 * Renderiza a view de Clientes
 */
export async function renderCustomersView(container) {
  container.innerHTML = `
    <div class="space-y-5">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="users" class="w-5 h-5 text-orange-400"></i>
            Gestão de Clientes & Vendas a Fiado / Crédito
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Cadastro de clientes reais, controle de limites de crédito para obras e amortização de débitos.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnRefreshCustomers" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Atualizar</span>
          </button>
          <button id="btnNewCustomer" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-950/40 transition active:scale-95">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Cadastrar Cliente</span>
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Total a Receber (Fiado Ativo)</span>
          <span id="kpiTotalDebt" class="text-2xl font-extrabold font-mono text-amber-400 mt-1 block">0.00 MT</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Clientes Cadastrados</span>
          <span id="kpiTotalCustomers" class="text-2xl font-extrabold font-mono text-white mt-1 block">0</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Segurança Operacional</span>
          <span class="text-xs text-slate-300 mt-1 block">
            Vendas a fiado bloqueadas no PDV quando excedem o limite autorizado.
          </span>
        </div>
      </div>

      <!-- Filtro de Busca -->
      <div class="relative">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input
          type="text"
          id="searchCustomersInput"
          placeholder="Pesquisar por nome do mestre de obra, empreiteira, telefone ou documento..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
        />
      </div>

      <!-- Grade de Clientes -->
      <div id="customersGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="col-span-full py-12 text-center text-slate-500 text-xs">
          <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
          Carregando carteira de clientes do banco...
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#searchCustomersInput');
  const grid = container.querySelector('#customersGrid');
  const refreshBtn = container.querySelector('#btnRefreshCustomers');
  const newBtn = container.querySelector('#btnNewCustomer');
  const kpiTotalDebt = container.querySelector('#kpiTotalDebt');
  const kpiTotalCustomers = container.querySelector('#kpiTotalCustomers');

  let customersList = [];

  const updateGrid = () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    const filtered = customersList.filter(c => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.tax_id && c.tax_id.toLowerCase().includes(q))
      );
    });

    const totalDebt = customersList.reduce((sum, c) => sum + (c.current_debt || 0), 0);
    kpiTotalDebt.textContent = `${totalDebt.toFixed(2)} MT`;
    kpiTotalCustomers.textContent = customersList.length;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-500 text-xs">
          Nenhum dado encontrado.
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(c => {
      const debt = Number(c.current_debt) || 0;
      const limit = Number(c.credit_limit) || 0;
      const isOverLimit = limit > 0 && debt >= limit;

      return `
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-slate-700 transition shadow-xs">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-sm text-white truncate max-w-[200px]">${c.name}</h3>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isOverLimit
                  ? 'bg-red-950 text-red-400 border border-red-500/30'
                  : debt > 0
                  ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
              }">
                ${isOverLimit ? 'LIMITE ESGOTADO' : debt > 0 ? 'EM DÉBITO' : 'REGULAR'}
              </span>
            </div>

            <div class="text-[11px] text-slate-400 space-y-0.5">
              <div>Telefone: <strong class="text-slate-300 font-mono">${c.phone || '-'}</strong></div>
              <div>Documento/NUIT: <span class="text-slate-300 font-mono">${c.tax_id || '-'}</span></div>
              ${c.address ? `<div class="truncate">Endereço: ${c.address}</div>` : ''}
            </div>

            <div class="pt-2 space-y-1">
              <div class="flex justify-between text-xs font-mono">
                <span class="text-slate-400">Dívida / Saldo Devedor:</span>
                <strong class="${debt > 0 ? 'text-red-400' : 'text-slate-300'}">${debt.toFixed(2)} MT</strong>
              </div>
              <div class="flex justify-between text-xs font-mono">
                <span class="text-slate-400">Limite Autorizado:</span>
                <span class="text-slate-200 font-bold">${limit.toFixed(2)} MT</span>
              </div>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800 flex gap-2">
            ${debt > 0 ? `
              <button class="btn-pay-debt flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm" data-id="${c.id}">
                Receber Pagamento
              </button>
            ` : `
              <span class="flex-1 text-center py-2 text-[11px] text-emerald-400 font-semibold">Conta em dia</span>
            `}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    grid.querySelectorAll('.btn-pay-debt').forEach(btn => {
      btn.addEventListener('click', () => {
        const cust = customersList.find(c => c.id === btn.dataset.id);
        if (cust) openPaymentModal(cust, reloadData);
      });
    });
  };

  const reloadData = async () => {
    customersList = await fetchCustomers();
    updateGrid();
  };

  searchInput.addEventListener('input', updateGrid);
  refreshBtn.addEventListener('click', reloadData);
  newBtn.addEventListener('click', () => openCustomerModal(reloadData));

  await reloadData();
}

function openCustomerModal(onSuccess) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="font-bold text-base text-white">Cadastrar Cliente Real</h3>
        <button id="closeCustModalBtn" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>

      <form id="custForm" class="space-y-3">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Nome Completo / Empreiteira *</label>
          <input type="text" id="custName" required placeholder="Ex: Mestre António Silva" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">Telefone / Contacto</label>
            <input type="text" id="custPhone" placeholder="+258 84 000 0000" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
          </div>
          <div>
            <label class="block text-slate-300 font-semibold mb-1">NUIT / Documento</label>
            <input type="text" id="custNuit" placeholder="400000000" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
          </div>
        </div>
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Endereço da Residência / Obra</label>
          <input type="text" id="custAddress" placeholder="Bairro, Rua, Ponto de Referência" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Limite Máximo de Crédito / Fiado (MT)</label>
          <input type="number" id="custCreditLimit" value="25000" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs" />
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button type="button" id="cancelCustBtn" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">Cancelar</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold">Salvar Cliente</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#closeCustModalBtn').addEventListener('click', close);
  modal.querySelector('#cancelCustBtn').addEventListener('click', close);

  modal.querySelector('#custForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await saveCustomer({
        name: modal.querySelector('#custName').value,
        phone: modal.querySelector('#custPhone').value,
        tax_id: modal.querySelector('#custNuit').value,
        address: modal.querySelector('#custAddress').value,
        credit_limit: modal.querySelector('#custCreditLimit').value
      });
      close();
      onSuccess();
    } catch (err) {
      alert(err.message || 'Erro ao salvar cliente.');
    }
  });
}

function openPaymentModal(customer, onSuccess) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="font-bold text-base text-white">Receber Amortização de Dívida</h3>
        <button id="closePayModalBtn" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>

      <p class="text-slate-300">
        Cliente: <strong class="text-white">${customer.name}</strong><br />
        Dívida Atual: <strong class="text-red-400 font-mono">${(customer.current_debt || 0).toFixed(2)} MT</strong>
      </p>

      <form id="payForm" class="space-y-3">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Valor a Receber (MT) *</label>
          <input type="number" step="any" min="0.01" max="${customer.current_debt || 0}" required id="payAmount" value="${customer.current_debt || 0}" class="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-xl font-bold" />
        </div>
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Forma de Recebimento</label>
          <select id="payMethod" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs">
            <option value="DINHEIRO">Dinheiro (Entra no Caixa)</option>
            <option value="M-PESA">M-Pesa</option>
            <option value="E-MOLA">e-Mola</option>
            <option value="TRANSFERENCIA">Transferência Bancária</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Observações</label>
          <input type="text" id="payNotes" placeholder="Ex: Pagamento parcial referente à compra de cimento" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button type="button" id="cancelPayBtn" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">Cancelar</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Confirmar Recebimento</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#closePayModalBtn').addEventListener('click', close);
  modal.querySelector('#cancelPayBtn').addEventListener('click', close);

  modal.querySelector('#payForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await registerCustomerPayment(
        customer.id,
        modal.querySelector('#payAmount').value,
        modal.querySelector('#payMethod').value,
        modal.querySelector('#payNotes').value
      );
      close();
      onSuccess();
    } catch (err) {
      alert(err.message || 'Erro ao registrar amortização.');
    }
  });
}

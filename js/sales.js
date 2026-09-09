/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Histórico de Vendas & Estornos Atômicos (js/sales.js)
 * Consulta direta ao Supabase e recomposição reversa de estoque em estornos
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { openReceiptModal } from './receipts.js';

let salesCache = [];

/**
 * Consulta o histórico de vendas no Supabase
 */
export async function fetchSales(storeIdParam = null) {
  const client = getSupabase();
  if (!client) return [];

  const storeId = storeIdParam || getCurrentStoreId();
  try {
    let query = client
      .from('sales')
      .select('*, sale_items(*)')
      .order('created_at', { ascending: false });

    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao consultar vendas:', error);
      return [];
    }

    salesCache = data || [];
    return salesCache;
  } catch (err) {
    console.error('Erro de conexão ao buscar vendas:', err);
    return [];
  }
}

/**
 * Executa o Estorno Reverso Atômico de uma venda (Recompõe estoque e registra auditoria)
 */
export async function reverseSale(saleId, reason) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = getCurrentStoreId();

  // 1. Obter os dados da venda e itens
  const { data: sale, error: fetchError } = await client
    .from('sales')
    .select('*, sale_items(*)')
    .eq('id', saleId)
    .single();

  if (fetchError || !sale) throw new Error('Venda não encontrada.');
  if (sale.status === 'REVERSED' || sale.status === 'CANCELADA') {
    throw new Error('Esta venda já foi estornada anteriormente.');
  }

  // 2. Recompor estoque para cada item vendido
  if (Array.isArray(sale.sale_items)) {
    for (const item of sale.sale_items) {
      if (item.product_id) {
        // Buscar saldo atual
        const { data: prod } = await client
          .from('products')
          .select('current_stock_base')
          .eq('id', item.product_id)
          .single();

        const curStock = Number(prod?.current_stock_base || 0);
        const restoredStock = curStock + Number(item.quantity_base || item.quantity);

        // Atualizar produto
        await client
          .from('products')
          .update({ current_stock_base: restoredStock })
          .eq('id', item.product_id);

        // Registrar movimentação reversa de estoque
        await client.from('stock_movements').insert({
          store_id: sale.store_id || storeId,
          product_id: item.product_id,
          movement_type: 'REVERSAL',
          quantity_base: Number(item.quantity_base || item.quantity),
          previous_stock_base: curStock,
          new_stock_base: restoredStock,
          reference_id: sale.id,
          reason: `Estorno de venda ${sale.sale_number}: ${reason || 'Devolução'}`,
          operator_name: user?.fullName || 'GEF'
        });
      }
    }
  }

  // 3. Atualizar status da venda
  const { error: updateError } = await client
    .from('sales')
    .update({
      status: 'CANCELADA',
      reversed_at: new Date().toISOString(),
      reversed_by: user?.fullName || 'GEF',
      reversal_reason: reason
    })
    .eq('id', saleId);

  if (updateError) throw new Error(formatErrorMessage(updateError));

  // 4. Se a venda foi fiado e tem cliente, abater dívida correspondente
  if (sale.payment_method === 'CREDITO_FIADO' && sale.customer_id) {
    const { data: cust } = await client
      .from('customers')
      .select('current_debt')
      .eq('id', sale.customer_id)
      .single();

    if (cust) {
      const newDebt = Math.max(0, (cust.current_debt || 0) - sale.total_net);
      await client.from('customers').update({ current_debt: newDebt }).eq('id', sale.customer_id);
    }
  }

  // 5. Registrar auditoria
  await client.from('audit_logs').insert({
    store_id: sale.store_id || storeId,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: 'ESTORNO_VENDA',
    entity: 'sales',
    record_id: saleId,
    details: {
      venda: sale.sale_number,
      motivo: reason,
      valor_estornado: sale.total_net,
      cliente: sale.customer_name
    }
  });

  return true;
}

/**
 * Renderiza a view de Histórico de Vendas
 */
export async function renderSalesView(container) {
  container.innerHTML = `
    <div class="space-y-5">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="receipt" class="w-5 h-5 text-orange-400"></i>
            Histórico de Vendas & Estornos Atômicos
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Registro detalhado de operações com nome do cliente, operador responsável e recomposição de estoque.
          </p>
        </div>
        <button id="btnRefreshSales" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
          <span>Atualizar Vendas</span>
        </button>
      </div>

      <!-- Filtro de Busca -->
      <div class="relative">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input
          type="text"
          id="salesSearchInput"
          placeholder="Filtrar por número da venda (VEN-...), nome do cliente ou operador..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
        />
      </div>

      <!-- Tabela de Vendas -->
      <div class="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-700">
              <tr>
                <th class="py-3 px-4">Nº Venda</th>
                <th class="py-3 px-4">Data / Hora</th>
                <th class="py-3 px-4">Cliente (Recibo)</th>
                <th class="py-3 px-4">Operador</th>
                <th class="py-3 px-4">Pagamento</th>
                <th class="py-3 px-4 text-right">Total</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody id="salesTableBody" class="divide-y divide-slate-800/80">
              <tr>
                <td colspan="8" class="py-12 text-center text-slate-500">
                  <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
                  Carregando vendas do banco...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#salesSearchInput');
  const tableBody = container.querySelector('#salesTableBody');
  const refreshBtn = container.querySelector('#btnRefreshSales');

  let salesList = [];

  const updateTable = () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    const filtered = salesList.filter(s => {
      if (!q) return true;
      return (
        (s.sale_number && s.sale_number.toLowerCase().includes(q)) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
        (s.cashier_name && s.cashier_name.toLowerCase().includes(q)) ||
        (s.payment_method && s.payment_method.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="py-12 text-center text-slate-500">
            Nenhum dado encontrado.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(sale => {
      const isCanceled = sale.status === 'CANCELADA' || sale.status === 'REVERSED';
      const dateStr = sale.created_at ? new Date(sale.created_at).toLocaleString('pt-PT') : '-';

      return `
        <tr class="hover:bg-slate-800/40 transition ${isCanceled ? 'opacity-60 bg-red-950/10' : ''}">
          <td class="py-3 px-4 font-mono font-bold text-white">
            ${sale.sale_number}
          </td>
          <td class="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
            ${dateStr}
          </td>
          <td class="py-3 px-4 font-semibold text-slate-200">
            ${sale.customer_name || 'Consumidor Final'}
          </td>
          <td class="py-3 px-4 text-slate-300">
            ${sale.cashier_name || 'GEF'}
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-slate-300">
              ${sale.payment_method}
            </span>
          </td>
          <td class="py-3 px-4 text-right font-mono font-extrabold text-white text-sm">
            ${Number(sale.total_net || 0).toFixed(2)} MT
          </td>
          <td class="py-3 px-4 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isCanceled
                ? 'bg-red-950 text-red-400 border border-red-500/30'
                : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
            }">
              ${isCanceled ? 'ESTORNADA' : 'CONCLUÍDA'}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <div class="inline-flex items-center gap-1.5">
              <button class="btn-receipt p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 transition" data-id="${sale.id}" title="Reemitir Recibo Térmico">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i>
              </button>
              ${!isCanceled ? `
                <button class="btn-reverse p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition" data-id="${sale.id}" title="Estorno Reverso Atômico">
                  <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Eventos Recibo
    tableBody.querySelectorAll('.btn-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = salesList.find(item => item.id === btn.dataset.id);
        if (s) {
          openReceiptModal({
            saleNumber: s.sale_number,
            customerName: s.customer_name || 'Consumidor Final',
            cashierName: s.cashier_name || 'GEF',
            items: (s.sale_items || []).map(it => ({
              name: it.product_name,
              packaging_name: it.packaging_name || 'un',
              quantity: it.quantity,
              unit_price: it.unit_price
            })),
            subtotal: s.subtotal || s.total_net,
            discount: s.discount_amount || 0,
            total: s.total_net,
            paymentMethod: s.payment_method,
            date: s.created_at
          });
        }
      });
    });

    // Eventos Estorno
    tableBody.querySelectorAll('.btn-reverse').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = salesList.find(item => item.id === btn.dataset.id);
        if (!s) return;
        const reason = prompt(`Confirmação de Estorno para a Venda ${s.sale_number}:\n\nO estoque dos itens será recomposto nos armazéns. Informe o motivo do estorno:`);
        if (reason && reason.trim()) {
          try {
            await reverseSale(s.id, reason.trim());
            alert(`Venda ${s.sale_number} estornada com sucesso! O estoque foi recomposto.`);
            await reloadData();
          } catch (err) {
            alert('Falha ao processar estorno: ' + err.message);
          }
        }
      });
    });
  };

  const reloadData = async () => {
    salesList = await fetchSales();
    updateTable();
  };

  searchInput.addEventListener('input', updateTable);
  refreshBtn.addEventListener('click', reloadData);

  await reloadData();
}

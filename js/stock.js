/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Estoque, Armazéns Físicos & Matriz FEFO (js/stock.js)
 * Controle rigoroso de estoque em Loja, Armazém Central e Pátio
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { fetchProducts } from './products.js';

/**
 * Classificação FEFO em 5 níveis
 */
export function getFefoStatus(expiryDate) {
  if (!expiryDate) {
    return { label: 'Sem Validade', color: 'bg-slate-800 text-slate-400 border-slate-700', level: 0 };
  }
  const today = new Date().getTime();
  const exp = new Date(expiryDate).getTime();
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return { label: `VENCIDO (${Math.abs(diffDays)}d)`, color: 'bg-red-950 text-red-400 border-red-500/40 animate-pulse', level: 1 };
  }
  if (diffDays <= 30) {
    return { label: `CRÍTICO (${diffDays}d)`, color: 'bg-orange-950 text-orange-400 border-orange-500/40', level: 2 };
  }
  if (diffDays <= 90) {
    return { label: `ALERTA (${diffDays}d)`, color: 'bg-amber-950 text-amber-400 border-amber-500/40', level: 3 };
  }
  if (diffDays <= 180) {
    return { label: `REGULAR (${diffDays}d)`, color: 'bg-yellow-950/60 text-yellow-300 border-yellow-500/30', level: 4 };
  }
  return { label: `SEGURO (>180d)`, color: 'bg-emerald-950 text-emerald-400 border-emerald-500/30', level: 5 };
}

/**
 * Realiza a transferência física entre localizações (LOJA, ARMAZEM, PATIO)
 */
export async function transferStock({ productId, fromLocation, toLocation, quantity, notes }) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = getCurrentStoreId();
  if (fromLocation === toLocation) {
    throw new Error('A localização de origem e destino devem ser diferentes.');
  }
  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Informe uma quantidade válida.');
  }

  // 1. Obter estoque na origem
  const { data: originStock } = await client
    .from('product_stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('store_id', storeId)
    .eq('location', fromLocation)
    .maybeSingle();

  const currentOriginQty = Number(originStock?.quantity || 0);
  if (currentOriginQty < qty) {
    throw new Error(`Saldo insuficiente na localização ${fromLocation}. Disponível: ${currentOriginQty}`);
  }

  // 2. Debitar da origem
  await client
    .from('product_stock')
    .upsert({
      product_id: productId,
      store_id: storeId,
      location: fromLocation,
      quantity: currentOriginQty - qty
    }, { onConflict: 'product_id,store_id,location' });

  // 3. Creditar no destino
  const { data: destStock } = await client
    .from('product_stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('store_id', storeId)
    .eq('location', toLocation)
    .maybeSingle();

  const currentDestQty = Number(destStock?.quantity || 0);
  await client
    .from('product_stock')
    .upsert({
      product_id: productId,
      store_id: storeId,
      location: toLocation,
      quantity: currentDestQty + qty
    }, { onConflict: 'product_id,store_id,location' });

  // 4. Registrar movimentação de estoque
  await client.from('stock_movements').insert({
    store_id: storeId,
    product_id: productId,
    movement_type: 'TRANSFER',
    quantity_base: qty,
    from_location: fromLocation,
    to_location: toLocation,
    reason: notes || `Transferência física de ${fromLocation} para ${toLocation}`,
    operator_name: user?.fullName || 'GEF'
  });

  return true;
}

/**
 * Renderiza a view de Estoque & Matriz FEFO
 */
export async function renderStockView(container) {
  container.innerHTML = `
    <div class="space-y-5">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="layers" class="w-5 h-5 text-orange-500"></i>
            Controle de Estoque Físico & Matriz FEFO
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Monitoramento de lotes por data de vencimento e distribuição física por armazém (Loja, Armazém, Pátio).
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnRefreshStock" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Atualizar</span>
          </button>
          <button id="btnOpenTransferGlobal" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-950/40 transition active:scale-95">
            <i data-lucide="arrow-left-right" class="w-4 h-4"></i>
            <span>Nova Transferência</span>
          </button>
        </div>
      </div>

      <!-- Legenda FEFO (5 Níveis) -->
      <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
          Matriz de Criticidade FEFO (First Expired, First Out):
        </span>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-semibold">
          <div class="p-2 rounded-lg bg-red-950/80 border border-red-500/40 text-red-300 text-center">
            1. Vencido (≤ 0d)
          </div>
          <div class="p-2 rounded-lg bg-orange-950/80 border border-orange-500/40 text-orange-300 text-center">
            2. Crítico (≤ 30d)
          </div>
          <div class="p-2 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 text-center">
            3. Alerta (≤ 90d)
          </div>
          <div class="p-2 rounded-lg bg-yellow-950/60 border border-yellow-500/30 text-yellow-200 text-center">
            4. Regular (≤ 180d)
          </div>
          <div class="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-center">
            5. Seguro (&gt;180d)
          </div>
        </div>
      </div>

      <!-- Filtros e Busca -->
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
          <input
            type="text"
            id="stockSearchInput"
            placeholder="Buscar por código ou nome do material..."
            class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
          />
        </div>
        <div class="flex rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs font-semibold">
          <button id="filterAllStock" class="stock-tab-btn active px-3 py-1.5 rounded-lg bg-orange-600 text-white transition">
            Todos os Materiais
          </button>
          <button id="filterCriticalStock" class="stock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
            Abaixo do Mínimo
          </button>
        </div>
      </div>

      <!-- Lista de Itens do Estoque -->
      <div id="stockListContainer" class="space-y-3">
        <div class="py-12 text-center text-slate-500 text-xs">
          <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
          Carregando dados de estoque do banco...
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#stockSearchInput');
  const stockList = container.querySelector('#stockListContainer');
  const refreshBtn = container.querySelector('#btnRefreshStock');
  const transferGlobalBtn = container.querySelector('#btnOpenTransferGlobal');
  const filterAllBtn = container.querySelector('#filterAllStock');
  const filterCriticalBtn = container.querySelector('#filterCriticalStock');

  let allProducts = [];
  let filterMode = 'ALL';

  const renderCards = () => {
    const q = (searchInput.value || '').toLowerCase().trim();

    const filtered = allProducts.filter(p => {
      if (filterMode === 'CRITICAL' && p.current_stock_base > p.min_stock_base) return false;
      if (!q) return true;
      return (
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      stockList.innerHTML = `
        <div class="py-12 text-center text-slate-500 text-xs">
          Nenhum dado encontrado.
        </div>
      `;
      return;
    }

    stockList.innerHTML = filtered.map(p => {
      const isCritical = p.current_stock_base <= p.min_stock_base;
      return `
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-3 shadow-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-bold text-orange-400 bg-orange-950/60 px-2 py-0.5 rounded border border-orange-500/30">
                  ${p.code}
                </span>
                <h3 class="font-bold text-sm text-white">${p.name}</h3>
                <span class="text-xs text-slate-400 uppercase">(${p.category})</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button class="btn-transfer-item flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition" data-id="${p.id}">
                <i data-lucide="arrow-left-right" class="w-3.5 h-3.5 text-orange-400"></i>
                <span>Transferir</span>
              </button>
            </div>
          </div>

          <!-- Distribuição Física -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
            <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span class="text-[10px] text-slate-400 block font-sans">LOJA / BALCÃO:</span>
              <span class="text-base font-extrabold text-white">
                ${p.stock_by_location?.LOJA || 0} ${p.base_unit}
              </span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span class="text-[10px] text-slate-400 block font-sans">ARMAZÉM CENTRAL:</span>
              <span class="text-base font-extrabold text-white">
                ${p.stock_by_location?.ARMAZEM || 0} ${p.base_unit}
              </span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span class="text-[10px] text-slate-400 block font-sans">PÁTIO DE AGREGADOS:</span>
              <span class="text-base font-extrabold text-white">
                ${p.stock_by_location?.PATIO || 0} ${p.base_unit}
              </span>
            </div>
            <div class="p-2.5 rounded-xl border ${
              isCritical
                ? 'bg-red-950/40 border-red-500/40 text-red-300'
                : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            }">
              <span class="text-[10px] block font-sans">ESTOQUE TOTAL DA EMPRESA:</span>
              <span class="text-base font-extrabold">
                ${p.current_stock_base} ${p.base_unit}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    stockList.querySelectorAll('.btn-transfer-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = allProducts.find(p => p.id === btn.dataset.id);
        if (prod) openTransferModal(prod, allProducts, reloadData);
      });
    });
  };

  const reloadData = async () => {
    allProducts = await fetchProducts();
    renderCards();
  };

  searchInput.addEventListener('input', renderCards);
  refreshBtn.addEventListener('click', reloadData);
  transferGlobalBtn.addEventListener('click', () => openTransferModal(null, allProducts, reloadData));

  filterAllBtn.addEventListener('click', () => {
    filterMode = 'ALL';
    filterAllBtn.className = 'stock-tab-btn active px-3 py-1.5 rounded-lg bg-orange-600 text-white transition';
    filterCriticalBtn.className = 'stock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    renderCards();
  });

  filterCriticalBtn.addEventListener('click', () => {
    filterMode = 'CRITICAL';
    filterCriticalBtn.className = 'stock-tab-btn active px-3 py-1.5 rounded-lg bg-orange-600 text-white transition';
    filterAllBtn.className = 'stock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    renderCards();
  });

  await reloadData();
}

/**
 * Modal de Transferência Física
 */
function openTransferModal(initialProduct, productList, onSuccess) {
  const modalContainer = document.createElement('div');
  modalContainer.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4';

  modalContainer.innerHTML = `
    <div class="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col text-xs text-slate-200">
      <div class="flex items-center justify-between px-6 py-4 bg-slate-800/90 border-b border-slate-700">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30">
            <i data-lucide="arrow-left-right" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-base text-white">Transferência entre Armazéns Físicos</h3>
            <p className="text-xs text-slate-400">Movimentação física com atualização no PostgreSQL</p>
          </div>
        </div>
        <button id="closeTransferModalBtn" class="p-1 rounded-lg text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="transferForm" class="p-6 space-y-4">
        <div id="transferError" class="hidden p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs"></div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Material / Produto</label>
          <select id="transferProductId" class="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-medium focus:outline-hidden focus:border-orange-500">
            ${productList.map(p => `
              <option value="${p.id}" ${initialProduct?.id === p.id ? 'selected' : ''}>
                [${p.code}] ${p.name} (Loja: ${p.stock_by_location?.LOJA || 0} | Armazém: ${p.stock_by_location?.ARMAZEM || 0} | Pátio: ${p.stock_by_location?.PATIO || 0})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Origem (Saída)</label>
            <select id="transferFromLocation" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-medium focus:outline-hidden focus:border-orange-500">
              <option value="ARMAZEM" selected>Armazém Central</option>
              <option value="PATIO">Pátio de Agregados</option>
              <option value="LOJA">Loja / Balcão</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Destino (Entrada)</label>
            <select id="transferToLocation" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-medium focus:outline-hidden focus:border-orange-500">
              <option value="LOJA" selected>Loja / Balcão</option>
              <option value="ARMAZEM">Armazém Central</option>
              <option value="PATIO">Pátio de Agregados</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Quantidade a Transferir</label>
          <input type="number" step="any" min="0.001" id="transferQuantity" required value="10" class="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-lg font-bold focus:outline-hidden focus:border-orange-500" />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Motivo / Observações</label>
          <input type="text" id="transferNotes" placeholder="Ex: Abastecimento de prateleira de balcão" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white" />
        </div>

        <div class="flex gap-3 pt-2">
          <button type="button" id="cancelTransferBtn" class="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs">
            Cancelar
          </button>
          <button type="submit" id="submitTransferBtn" class="flex-2 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-orange-950/50">
            Confirmar Transferência
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalContainer);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modalContainer.remove();
  modalContainer.querySelector('#closeTransferModalBtn').addEventListener('click', close);
  modalContainer.querySelector('#cancelTransferBtn').addEventListener('click', close);

  modalContainer.querySelector('#transferForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = modalContainer.querySelector('#transferError');
    const submitBtn = modalContainer.querySelector('#submitTransferBtn');

    errorBox.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processando no Supabase...';

    try {
      await transferStock({
        productId: modalContainer.querySelector('#transferProductId').value,
        fromLocation: modalContainer.querySelector('#transferFromLocation').value,
        toLocation: modalContainer.querySelector('#transferToLocation').value,
        quantity: modalContainer.querySelector('#transferQuantity').value,
        notes: modalContainer.querySelector('#transferNotes').value
      });

      close();
      onSuccess();
    } catch (err) {
      errorBox.textContent = err.message || 'Erro ao processar transferência.';
      errorBox.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar Transferência';
    }
  });
}

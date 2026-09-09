/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Produtos, Catálogo & Conversões (js/products.js)
 * Consulta direta ao Supabase (PostgreSQL) — 100% livre de dados mockados
 * Suporta inserção massiva direta via SQL
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';

let productsCache = [];

/**
 * Consulta a lista oficial de produtos no Supabase (Requisitos 3, 4 e 5)
 */
export async function fetchProducts(storeIdParam = null) {
  const client = getSupabase();
  if (!client) return [];

  const storeId = storeIdParam || getCurrentStoreId();
  try {
    let query = client
      .from('products')
      .select('*, product_conversions(*), product_stock(*)')
      .order('name', { ascending: true });

    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao consultar produtos no Supabase:', error);
      return [];
    }

    productsCache = (data || []).map(p => {
      // Mapeamento das quantidades de estoque físico por localização
      const stockMap = { LOJA: 0, ARMAZEM: 0, PATIO: 0 };
      if (Array.isArray(p.product_stock)) {
        p.product_stock.forEach(s => {
          if (s.location && s.quantity !== undefined) {
            stockMap[s.location] = Number(s.quantity) || 0;
          }
        });
      }

      const totalStock = (stockMap.LOJA + stockMap.ARMAZEM + stockMap.PATIO) || Number(p.current_stock_base) || 0;

      return {
        id: p.id,
        store_id: p.store_id,
        code: p.code || 'S/C',
        barcode: p.barcode || '',
        name: p.name,
        description: p.description || '',
        category: p.category || 'Geral',
        base_unit: p.base_unit || 'un',
        min_stock_base: Number(p.min_stock_base) || 10,
        current_stock_base: totalStock,
        stock_by_location: stockMap,
        cost_price_base: Number(p.cost_price_base) || 0,
        sale_price_base: Number(p.sale_price_base) || 0,
        is_sold_by_weight: Boolean(p.is_sold_by_weight),
        is_sold_by_length: Boolean(p.is_sold_by_length),
        active: p.active !== false,
        conversions: Array.isArray(p.product_conversions) ? p.product_conversions : []
      };
    });

    return productsCache;
  } catch (err) {
    console.error('Falha de rede ao buscar produtos:', err);
    return [];
  }
}

/**
 * Salva ou atualiza um produto no PostgreSQL real
 */
export async function saveProduct(productData) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = productData.store_id || getCurrentStoreId();
  if (!storeId || storeId === 'ALL') {
    throw new Error('Selecione uma loja específica para salvar o produto.');
  }

  const payload = {
    store_id: storeId,
    code: productData.code?.trim() || 'PRD-' + Math.floor(1000 + Math.random() * 9000),
    barcode: productData.barcode?.trim() || null,
    name: productData.name?.trim(),
    description: productData.description?.trim() || null,
    category: productData.category?.trim() || 'Geral',
    base_unit: productData.base_unit?.trim() || 'un',
    min_stock_base: Number(productData.min_stock_base) || 10,
    cost_price_base: Number(productData.cost_price_base) || 0,
    sale_price_base: Number(productData.sale_price_base) || 0,
    is_sold_by_weight: Boolean(productData.is_sold_by_weight),
    is_sold_by_length: Boolean(productData.is_sold_by_length),
    active: productData.active !== false
  };

  let savedProduct = null;
  if (productData.id) {
    // Atualizar
    const { data, error } = await client
      .from('products')
      .update(payload)
      .eq('id', productData.id)
      .select()
      .single();

    if (error) throw new Error(formatErrorMessage(error));
    savedProduct = data;
  } else {
    // Inserir
    const { data, error } = await client
      .from('products')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(formatErrorMessage(error));
    savedProduct = data;
  }

  // Atualizar estoque nas 3 localizações se fornecido
  if (productData.stock_by_location && savedProduct?.id) {
    for (const [loc, qty] of Object.entries(productData.stock_by_location)) {
      await client.from('product_stock').upsert({
        product_id: savedProduct.id,
        store_id: storeId,
        location: loc,
        quantity: Number(qty) || 0
      }, { onConflict: 'product_id,store_id,location' });
    }
  }

  // Atualizar conversões se fornecidas
  if (Array.isArray(productData.conversions) && savedProduct?.id) {
    for (const conv of productData.conversions) {
      if (conv.packaging_name && conv.multiplier) {
        await client.from('product_conversions').upsert({
          id: conv.id || undefined,
          product_id: savedProduct.id,
          packaging_name: conv.packaging_name.trim(),
          multiplier: Number(conv.multiplier) || 1,
          sale_price: Number(conv.sale_price) || 0,
          barcode: conv.barcode || null,
          active: true
        });
      }
    }
  }

  // Registrar auditoria
  await client.from('audit_logs').insert({
    store_id: storeId,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: productData.id ? 'ATUALIZACAO_PRODUTO' : 'CRIACAO_PRODUTO',
    entity: 'products',
    record_id: savedProduct.id,
    details: {
      codigo: savedProduct.code,
      nome: savedProduct.name,
      preco_venda: savedProduct.sale_price_base
    }
  });

  return savedProduct;
}

/**
 * Exclui ou inativa um produto no PostgreSQL
 */
export async function deleteProduct(productId) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const { error } = await client.from('products').update({ active: false }).eq('id', productId);
  if (error) throw new Error(formatErrorMessage(error));

  await client.from('audit_logs').insert({
    store_id: getCurrentStoreId() || null,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: 'INATIVACAO_PRODUTO',
    entity: 'products',
    record_id: productId,
    details: { id: productId }
  });

  return true;
}

/**
 * Renderiza a view de Produtos no elemento container
 */
export async function renderProductsView(container) {
  container.innerHTML = `
    <div class="space-y-5">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="package" class="w-5 h-5 text-orange-500"></i>
            Catálogo de Materiais & Conversões
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Consulta direta ao PostgreSQL. Produtos inseridos diretamente via SQL aparecem imediatamente aqui.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnRefreshProducts" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Recarregar do Banco</span>
          </button>
          <button id="btnNewProduct" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-950/40 transition active:scale-95">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Cadastrar Material</span>
          </button>
        </div>
      </div>

      <!-- Filtros e Busca Rápida -->
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
          <input
            type="text"
            id="searchProductsInput"
            placeholder="Pesquisar por código (ex: CIM, ACO), nome do material ou código de barras..."
            class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
          />
        </div>
        <select id="filterCategorySelect" class="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium focus:outline-hidden focus:border-orange-500">
          <option value="TODAS">Todas as Categorias</option>
        </select>
      </div>

      <!-- Tabela de Produtos -->
      <div class="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-700">
              <tr>
                <th class="py-3 px-4">Código</th>
                <th class="py-3 px-4">Material / Descrição</th>
                <th class="py-3 px-4">Unidade</th>
                <th class="py-3 px-4 text-center">Estoque Físico (Loja / Armazém / Pátio)</th>
                <th class="py-3 px-4 text-right">Preço de Custo</th>
                <th class="py-3 px-4 text-right">Preço de Venda</th>
                <th class="py-3 px-4 text-right">Margem</th>
                <th class="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody id="productsTableBody" class="divide-y divide-slate-800/80">
              <tr>
                <td colspan="8" class="py-12 text-center text-slate-500">
                  <div class="flex flex-col items-center justify-center gap-2">
                    <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin text-orange-500"></i>
                    <span>Consultando catálogo no Supabase...</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#searchProductsInput');
  const categorySelect = container.querySelector('#filterCategorySelect');
  const tableBody = container.querySelector('#productsTableBody');
  const refreshBtn = container.querySelector('#btnRefreshProducts');
  const newProductBtn = container.querySelector('#btnNewProduct');

  let allProducts = [];

  const updateTable = () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    const cat = categorySelect.value;

    const filtered = allProducts.filter(p => {
      if (cat !== 'TODAS' && p.category !== cat) return false;
      if (!q) return true;
      return (
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
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

    tableBody.innerHTML = filtered.map(p => {
      const margin = p.sale_price_base > 0 
        ? (((p.sale_price_base - p.cost_price_base) / p.sale_price_base) * 100).toFixed(1)
        : '0.0';

      const conversionsBadge = p.conversions?.length > 0 
        ? `<div class="mt-1 flex flex-wrap gap-1">${p.conversions.map(c => 
            `<span class="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] font-mono text-cyan-300 border border-slate-700">${c.packaging_name} (${c.multiplier}x): ${c.sale_price} MT</span>`
          ).join('')}</div>`
        : '';

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-3 px-4 font-mono font-bold text-orange-400">
            ${p.code}
          </td>
          <td class="py-3 px-4">
            <span class="font-bold text-white block">${p.name}</span>
            <span class="text-[10px] text-slate-400 uppercase">${p.category}</span>
            ${conversionsBadge}
          </td>
          <td class="py-3 px-4 font-mono">
            <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-200">
              ${p.base_unit}
            </span>
            ${p.is_sold_by_weight ? '<span class="ml-1 text-[9px] text-amber-400 font-bold">BALANÇA</span>' : ''}
          </td>
          <td class="py-3 px-4 text-center font-mono">
            <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-[11px]">
              <span title="Loja" class="text-slate-300">L: <strong>${p.stock_by_location?.LOJA ?? 0}</strong></span>
              <span class="text-slate-600">|</span>
              <span title="Armazém Central" class="text-slate-300">A: <strong>${p.stock_by_location?.ARMAZEM ?? 0}</strong></span>
              <span class="text-slate-600">|</span>
              <span title="Pátio" class="text-slate-300">P: <strong>${p.stock_by_location?.PATIO ?? 0}</strong></span>
            </div>
          </td>
          <td class="py-3 px-4 text-right font-mono text-slate-400">
            ${p.cost_price_base.toFixed(2)} MT
          </td>
          <td class="py-3 px-4 text-right font-mono font-extrabold text-white">
            ${p.sale_price_base.toFixed(2)} MT
          </td>
          <td class="py-3 px-4 text-right font-mono font-bold text-emerald-400">
            ${margin}%
          </td>
          <td class="py-3 px-4 text-center">
            <div class="inline-flex items-center gap-1">
              <button class="btn-edit-prod p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition" data-id="${p.id}" title="Editar">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button class="btn-delete-prod p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 transition" data-id="${p.id}" title="Inativar">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Eventos dos botões de editar e deletar
    tableBody.querySelectorAll('.btn-edit-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = allProducts.find(p => p.id === btn.dataset.id);
        if (prod) openProductModal(prod, reloadData);
      });
    });

    tableBody.querySelectorAll('.btn-delete-prod').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Deseja inativar este produto?')) {
          await deleteProduct(btn.dataset.id);
          await reloadData();
        }
      });
    });
  };

  const reloadData = async () => {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400">
          <i data-lucide="refresh-cw" class="w-5 h-5 animate-spin mx-auto text-orange-500 mb-1"></i>
          Atualizando do Supabase...
        </td>
      </tr>
    `;
    if (window.lucide) window.lucide.createIcons();

    allProducts = await fetchProducts();

    // Atualizar categorias
    const categories = ['TODAS', ...Array.from(new Set(allProducts.map(p => p.category || 'Geral')))];
    categorySelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');

    updateTable();
  };

  searchInput.addEventListener('input', updateTable);
  categorySelect.addEventListener('change', updateTable);
  refreshBtn.addEventListener('click', reloadData);
  newProductBtn.addEventListener('click', () => openProductModal(null, reloadData));

  // Carga inicial
  await reloadData();
}

/**
 * Modal para criar / editar produto
 */
function openProductModal(existingProduct, onSuccess) {
  const isEditing = Boolean(existingProduct);
  const modalContainer = document.createElement('div');
  modalContainer.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto';

  modalContainer.innerHTML = `
    <div class="relative w-full max-w-2xl my-6 rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs text-slate-200">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="font-bold text-base text-white flex items-center gap-2">
          <i data-lucide="package" class="w-4 h-4 text-orange-400"></i>
          ${isEditing ? 'Editar Material' : 'Cadastrar Novo Material'}
        </h3>
        <button id="closeModalBtn" class="text-slate-400 hover:text-white p-1">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="productForm" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Código Interno</label>
            <input type="text" id="prodCode" required value="${existingProduct?.code || 'MAT-' + Math.floor(100 + Math.random() * 900)}" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs" />
          </div>
          <div class="sm:col-span-2">
            <label class="block text-xs font-semibold text-slate-300 mb-1">Nome Comercial do Material *</label>
            <input type="text" id="prodName" required placeholder="Ex: Cimento Maua 42.5N (Saco 50kg)" value="${existingProduct?.name || ''}" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Categoria</label>
            <input type="text" id="prodCategory" value="${existingProduct?.category || 'Ferragens & Fixação'}" placeholder="Ex: Cimento & Agregados" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Unidade Base *</label>
            <select id="prodBaseUnit" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono font-bold">
              <option value="un" ${existingProduct?.base_unit === 'un' ? 'selected' : ''}>un (Unidade / Peça)</option>
              <option value="kg" ${existingProduct?.base_unit === 'kg' ? 'selected' : ''}>kg (Quilograma / Granel)</option>
              <option value="saco" ${existingProduct?.base_unit === 'saco' ? 'selected' : ''}>saco (Cimento / Cal)</option>
              <option value="barra" ${existingProduct?.base_unit === 'barra' ? 'selected' : ''}>barra (Varão de Aço / Tubos)</option>
              <option value="m" ${existingProduct?.base_unit === 'm' ? 'selected' : ''}>m (Metro Linear)</option>
              <option value="m2" ${existingProduct?.base_unit === 'm2' ? 'selected' : ''}>m² (Metro Quadrado)</option>
              <option value="m3" ${existingProduct?.base_unit === 'm3' ? 'selected' : ''}>m³ (Metro Cúbico - Areia/Brita)</option>
              <option value="lata" ${existingProduct?.base_unit === 'lata' ? 'selected' : ''}>lata / balde (20L)</option>
              <option value="rolo" ${existingProduct?.base_unit === 'rolo' ? 'selected' : ''}>rolo (Arame / Cabos)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Alerta de Estoque Mínimo</label>
            <input type="number" id="prodMinStock" value="${existingProduct?.min_stock_base || 10}" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Preço de Custo (MT) *</label>
            <input type="number" step="0.01" id="prodCostPrice" required value="${existingProduct?.cost_price_base || 0}" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs font-bold" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Preço de Venda (MT) *</label>
            <input type="number" step="0.01" id="prodSalePrice" required value="${existingProduct?.sale_price_base || 0}" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-xs font-bold" />
          </div>
        </div>

        <!-- Estoque Físico por Localização -->
        <div class="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700 space-y-2">
          <label class="block text-xs font-bold text-slate-300 uppercase">Estoque Físico por Armazém:</label>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <span class="text-[10px] text-slate-400 block">LOJA / BALCÃO</span>
              <input type="number" step="any" id="stockLoja" value="${existingProduct?.stock_by_location?.LOJA || 0}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
            </div>
            <div>
              <span class="text-[10px] text-slate-400 block">ARMAZÉM CENTRAL</span>
              <input type="number" step="any" id="stockArmazem" value="${existingProduct?.stock_by_location?.ARMAZEM || 0}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
            </div>
            <div>
              <span class="text-[10px] text-slate-400 block">PÁTIO DE AGREGADOS</span>
              <input type="number" step="any" id="stockPatio" value="${existingProduct?.stock_by_location?.PATIO || 0}" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer text-slate-300">
            <input type="checkbox" id="prodWeight" ${existingProduct?.is_sold_by_weight ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-orange-600" />
            <span>Vendido por Peso (Balança)</span>
          </label>
        </div>

        <div id="modalError" class="hidden p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs"></div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button type="button" id="cancelModalBtn" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold">
            Cancelar
          </button>
          <button type="submit" id="saveProductSubmitBtn" class="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold shadow-md shadow-orange-950/40">
            Salvar Material no Banco
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalContainer);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modalContainer.remove();
  modalContainer.querySelector('#closeModalBtn').addEventListener('click', close);
  modalContainer.querySelector('#cancelModalBtn').addEventListener('click', close);

  modalContainer.querySelector('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = modalContainer.querySelector('#modalError');
    const submitBtn = modalContainer.querySelector('#saveProductSubmitBtn');

    errorBox.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando no PostgreSQL...';

    try {
      await saveProduct({
        id: existingProduct?.id,
        code: modalContainer.querySelector('#prodCode').value,
        name: modalContainer.querySelector('#prodName').value,
        category: modalContainer.querySelector('#prodCategory').value,
        base_unit: modalContainer.querySelector('#prodBaseUnit').value,
        min_stock_base: modalContainer.querySelector('#prodMinStock').value,
        cost_price_base: modalContainer.querySelector('#prodCostPrice').value,
        sale_price_base: modalContainer.querySelector('#prodSalePrice').value,
        is_sold_by_weight: modalContainer.querySelector('#prodWeight').checked,
        stock_by_location: {
          LOJA: modalContainer.querySelector('#stockLoja').value,
          ARMAZEM: modalContainer.querySelector('#stockArmazem').value,
          PATIO: modalContainer.querySelector('#stockPatio').value
        }
      });

      close();
      onSuccess();
    } catch (err) {
      errorBox.textContent = err.message || 'Falha ao salvar produto no Supabase.';
      errorBox.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Salvar Material no Banco';
    }
  });
}

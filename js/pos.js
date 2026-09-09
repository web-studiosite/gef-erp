/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo do Ponto de Venda — PDV & Balcão (js/pos.js)
 * Suporte a Venda Rápida, Digitação Direta de Quantidade, Desconto e
 * Campo Opcional de "Nome do Cliente" para o Recibo (Requisitos 17 e 18)
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { fetchProducts } from './products.js';
import { fetchCustomers } from './customers.js';
import { openReceiptModal } from './receipts.js';

let cart = [];
let availableProducts = [];
let registeredCustomers = [];
let selectedPaymentMethod = 'DINHEIRO';

/**
 * Renderiza o PDV completo na tela
 */
export async function renderPosView(container) {
  const storeId = getCurrentStoreId();
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="flex flex-col xl:flex-row gap-5 h-auto xl:h-[calc(100vh-6.5rem)] min-h-[580px]">
      <!-- Coluna Esquerda: Catálogo e Busca -->
      <div class="flex-1 flex flex-col min-w-0 bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden shadow-lg">
        <!-- Barra de Busca Rápida e Leitor de Barras -->
        <div class="space-y-3 pb-3 border-b border-slate-800">
          <div class="relative">
            <i data-lucide="search" class="w-4 h-4 text-orange-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="text"
              id="posSearchInput"
              placeholder="Buscar material por nome, código (CIM, ACO), barras ou categoria... (F2)"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
              autofocus
            />
          </div>
          <!-- Categorias -->
          <div id="posCategoriesBar" class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button class="cat-btn active px-3 py-1 rounded-lg bg-orange-600 text-white font-semibold whitespace-nowrap" data-cat="TODAS">
              Todas
            </button>
          </div>
        </div>

        <!-- Grade de Produtos -->
        <div id="posProductGrid" class="flex-1 overflow-y-auto pt-3 pr-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-max">
          <div class="col-span-full py-12 text-center text-slate-500 text-xs">
            <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
            Carregando catálogo do Supabase...
          </div>
        </div>
      </div>

      <!-- Coluna Direita: Carrinho, Cliente, Desconto e Fechamento -->
      <div class="w-full xl:w-96 shrink-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden shadow-xl">
        <!-- Header do Carrinho -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-800">
          <div class="flex items-center gap-2">
            <i data-lucide="shopping-cart" class="w-4 h-4 text-orange-500"></i>
            <h3 class="font-bold text-sm text-white">Carrinho de Balcão</h3>
            <span id="posCartBadge" class="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono font-bold text-orange-400">
              0
            </span>
          </div>
          <button id="btnClearCartBtn" class="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1 transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Limpar (F8)</span>
          </button>
        </div>

        <!-- Requisitos 17 e 18: Campo 'Nome do cliente' Opcional durante a venda -->
        <div class="py-3 border-b border-slate-800 space-y-2 bg-slate-950/40 p-3 rounded-xl mt-2 border border-slate-800/80">
          <div class="flex items-center justify-between text-xs">
            <label class="font-semibold text-slate-300 flex items-center gap-1.5">
              <i data-lucide="user" class="w-3.5 h-3.5 text-orange-400"></i>
              <span>Nome do Cliente (no Recibo)</span>
            </label>
            <span class="text-[10px] text-slate-500 uppercase">Opcional</span>
          </div>
          <input
            type="text"
            id="posCustomerInput"
            placeholder="Digite o nome do comprador (ex: João Manuel)..."
            class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
          />

          <!-- Seleção Opcional de Cliente Cadastrado -->
          <div class="flex items-center gap-1 text-[11px] text-slate-400">
            <select id="posSelectRegisteredCustomer" class="w-full px-2 py-1 bg-slate-800/80 border border-slate-700 rounded-md text-[11px] text-slate-300 focus:outline-hidden">
              <option value="">Ou vincular a cliente cadastrado...</option>
            </select>
          </div>
        </div>

        <!-- Mensagens de Alerta / Erro -->
        <div id="posAlertBanner" class="hidden my-2 p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2"></div>

        <!-- Lista de Itens do Carrinho -->
        <div id="posCartItemsList" class="flex-1 overflow-y-auto py-2 divide-y divide-slate-800/80 space-y-1 min-h-[140px]">
          <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <i data-lucide="shopping-cart" class="w-8 h-8 text-slate-700 mb-1"></i>
            <span class="text-xs">Nenhum item adicionado</span>
            <span class="text-[10px] text-slate-600">Selecione materiais no catálogo</span>
          </div>
        </div>

        <!-- Fechamento: Formas de Pagamento, Desconto e Total -->
        <div class="pt-3 border-t border-slate-800 space-y-2.5">
          <!-- Formas de Pagamento -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-400 mb-1">Forma de Pagamento:</label>
            <div id="posPaymentMethods" class="grid grid-cols-3 gap-1 text-[10px] font-bold">
              <button class="pay-btn active py-1.5 px-1 rounded-lg bg-orange-600 text-white border border-orange-500 text-center" data-method="DINHEIRO">
                Dinheiro
              </button>
              <button class="pay-btn py-1.5 px-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-center" data-method="M-PESA">
                M-Pesa
              </button>
              <button class="pay-btn py-1.5 px-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-center" data-method="E-MOLA">
                e-Mola
              </button>
              <button class="pay-btn py-1.5 px-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-center" data-method="CARTAO">
                Cartão POS
              </button>
              <button class="pay-btn py-1.5 px-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-center" data-method="TRANSFERENCIA">
                Transferência
              </button>
              <button class="pay-btn py-1.5 px-1 rounded-lg bg-slate-800 text-amber-400 border border-slate-700 hover:bg-slate-700 text-center" data-method="CREDITO_FIADO">
                Fiado / Obra
              </button>
            </div>
          </div>

          <!-- Dinheiro & Troco -->
          <div id="posCashCalculationBox" class="grid grid-cols-2 gap-2 bg-slate-800/60 p-2 rounded-xl border border-slate-700/80 text-xs">
            <div>
              <span class="block text-[10px] text-slate-400">Valor Entregue (MT):</span>
              <input type="number" step="any" id="posCashTenderedInput" placeholder="0.00" class="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs font-bold" />
            </div>
            <div>
              <span class="block text-[10px] text-slate-400">Troco Calculado:</span>
              <div id="posChangeDisplay" class="px-2 py-1 rounded bg-slate-900 border border-slate-700 font-mono text-xs font-bold text-emerald-400">
                0.00 MT
              </div>
            </div>
          </div>

          <!-- Subtotal e Desconto antes do Total -->
          <div class="space-y-1.5 pt-1 text-xs">
            <div class="flex justify-between text-slate-400">
              <span>Subtotal:</span>
              <span id="posSubtotalDisplay" class="font-mono font-bold text-white">0.00 MT</span>
            </div>

            <div class="p-2 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
              <span class="font-semibold text-slate-300 text-xs">Desconto (MT):</span>
              <input
                type="number"
                min="0"
                step="any"
                id="posDiscountInput"
                value="0"
                class="w-24 px-2 py-1 rounded-lg bg-slate-900 border border-orange-500/50 text-right font-mono font-bold text-xs text-orange-400"
              />
            </div>

            <div class="flex justify-between items-baseline pt-1.5 border-t border-slate-800">
              <span class="font-bold text-slate-300 uppercase text-xs">Total a Pagar:</span>
              <span id="posTotalDisplay" class="text-2xl font-black text-orange-400 font-mono">0.00 MT</span>
            </div>
          </div>

          <!-- Botão Finalizar -->
          <button
            id="btnFinalizeSale"
            class="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 transition active:scale-98"
          >
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Finalizar Venda & Emitir Recibo (F4)</span>
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Elementos do DOM
  const searchInput = container.querySelector('#posSearchInput');
  const categoriesBar = container.querySelector('#posCategoriesBar');
  const productGrid = container.querySelector('#posProductGrid');
  const cartList = container.querySelector('#posCartItemsList');
  const cartBadge = container.querySelector('#posCartBadge');
  const subtotalDisplay = container.querySelector('#posSubtotalDisplay');
  const discountInput = container.querySelector('#posDiscountInput');
  const totalDisplay = container.querySelector('#posTotalDisplay');
  const cashTenderedInput = container.querySelector('#posCashTenderedInput');
  const changeDisplay = container.querySelector('#posChangeDisplay');
  const finalizeBtn = container.querySelector('#btnFinalizeSale');
  const clearCartBtn = container.querySelector('#btnClearCartBtn');
  const customerInput = container.querySelector('#posCustomerInput');
  const selectCustomer = container.querySelector('#posSelectRegisteredCustomer');
  const alertBanner = container.querySelector('#posAlertBanner');
  const paymentButtons = container.querySelectorAll('.pay-btn');

  let selectedCategory = 'TODAS';

  const showAlert = (msg) => {
    if (!msg) {
      alertBanner.classList.add('hidden');
      alertBanner.textContent = '';
      return;
    }
    alertBanner.textContent = msg;
    alertBanner.classList.remove('hidden');
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((acc, it) => acc + (it.quantity * it.unit_price), 0);
    const discount = Math.max(0, Number(discountInput.value) || 0);
    const total = Math.max(0, subtotal - discount);

    subtotalDisplay.textContent = `${subtotal.toFixed(2)} MT`;
    totalDisplay.textContent = `${total.toFixed(2)} MT`;
    cartBadge.textContent = cart.length;

    // Troco
    const cashVal = Number(cashTenderedInput.value) || 0;
    const change = (selectedPaymentMethod === 'DINHEIRO' && cashVal > total) ? (cashVal - total) : 0;
    changeDisplay.textContent = `${change.toFixed(2)} MT`;

    return { subtotal, discount, total, change };
  };

  const renderCart = () => {
    if (cart.length === 0) {
      cartList.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
          <i data-lucide="shopping-cart" class="w-8 h-8 text-slate-700 mb-1"></i>
          <span class="text-xs">Nenhum item adicionado</span>
          <span class="text-[10px] text-slate-600">Selecione materiais no catálogo</span>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      calculateTotals();
      return;
    }

    cartList.innerHTML = cart.map((item, idx) => {
      const lineTotal = (item.quantity * item.unit_price).toFixed(2);
      return `
        <div class="py-2 space-y-1">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-xs text-white truncate">${item.name}</div>
              <span class="text-[10px] text-slate-400 font-mono">${item.unit_price.toFixed(2)} MT / ${item.packaging_name}</span>
            </div>
            <span class="font-bold text-xs text-white font-mono">${lineTotal} MT</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <!-- Digitação Direta da Quantidade -->
            <div class="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <input 
                type="number"
                step="any"
                min="0.01"
                value="${item.quantity}"
                class="pos-item-qty w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-600 rounded text-center font-mono font-bold text-xs text-white focus:outline-hidden"
                data-index="${idx}"
                title="Digite diretamente a quantidade"
              />
              <span class="text-[10px] font-bold text-orange-400 pr-1 uppercase font-mono">${item.packaging_name}</span>
            </div>
            <button class="btn-remove-item text-slate-500 hover:text-red-400 p-1 transition" data-index="${idx}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Eventos de alteração de quantidade direta
    cartList.querySelectorAll('.pos-item-qty').forEach(input => {
      input.addEventListener('change', (e) => {
        const i = Number(e.target.dataset.index);
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val <= 0) {
          cart.splice(i, 1);
        } else {
          cart[i].quantity = val;
        }
        renderCart();
      });
    });

    cartList.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.index);
        cart.splice(i, 1);
        renderCart();
      });
    });

    calculateTotals();
  };

  const renderCatalog = () => {
    const q = (searchInput.value || '').toLowerCase().trim();

    const filtered = availableProducts.filter(p => {
      if (selectedCategory !== 'TODAS' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      productGrid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-500 text-xs">
          Nenhum material encontrado.
        </div>
      `;
      return;
    }

    productGrid.innerHTML = filtered.map(p => {
      const isOutOfStock = p.current_stock_base <= 0;
      return `
        <div class="pos-prod-card p-3 rounded-xl border bg-slate-800/70 border-slate-700/80 hover:border-orange-500/60 hover:bg-slate-800 transition cursor-pointer flex flex-col justify-between select-none shadow-xs group" data-id="${p.id}">
          <div>
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="font-mono text-[10px] font-bold text-orange-400 bg-orange-950/60 px-1.5 py-0.5 rounded border border-orange-500/20">
                ${p.code}
              </span>
              <span class="text-[10px] font-mono ${isOutOfStock ? 'text-red-400 font-bold' : 'text-emerald-400'}">
                Estoque: ${p.current_stock_base} ${p.base_unit}
              </span>
            </div>
            <h4 class="font-bold text-xs text-white group-hover:text-orange-300 transition line-clamp-2">
              ${p.name}
            </h4>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between">
            <span class="text-[10px] text-slate-400 uppercase">${p.base_unit}</span>
            <span class="text-sm font-extrabold text-white font-mono">
              ${p.sale_price_base.toFixed(2)} MT
            </span>
          </div>
        </div>
      `;
    }).join('');

    productGrid.querySelectorAll('.pos-prod-card').forEach(card => {
      card.addEventListener('click', () => {
        const prod = availableProducts.find(p => p.id === card.dataset.id);
        if (prod) {
          // Adicionar ao carrinho
          const existing = cart.find(it => it.product_id === prod.id && it.packaging_name === prod.base_unit);
          if (existing) {
            existing.quantity += 1;
          } else {
            cart.push({
              product_id: prod.id,
              code: prod.code,
              name: prod.name,
              packaging_name: prod.base_unit,
              multiplier: 1,
              unit_price: prod.sale_price_base,
              unit_cogs: prod.cost_price_base,
              quantity: 1
            });
          }
          renderCart();
        }
      });
    });
  };

  const loadData = async () => {
    availableProducts = await fetchProducts();
    registeredCustomers = await fetchCustomers();

    // Renderizar categorias
    const cats = ['TODAS', ...Array.from(new Set(availableProducts.map(p => p.category || 'Geral')))];
    categoriesBar.innerHTML = cats.map(c => `
      <button class="cat-btn px-3 py-1 rounded-lg ${c === selectedCategory ? 'bg-orange-600 text-white font-semibold' : 'bg-slate-800 text-slate-400 hover:text-white'} whitespace-nowrap" data-cat="${c}">
        ${c}
      </button>
    `).join('');

    categoriesBar.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCategory = btn.dataset.cat;
        categoriesBar.querySelectorAll('.cat-btn').forEach(b => {
          b.className = `cat-btn px-3 py-1 rounded-lg ${b.dataset.cat === selectedCategory ? 'bg-orange-600 text-white font-semibold' : 'bg-slate-800 text-slate-400 hover:text-white'} whitespace-nowrap`;
        });
        renderCatalog();
      });
    });

    // Renderizar clientes cadastrados no dropdown opcional
    selectCustomer.innerHTML = `
      <option value="">Ou vincular a cliente cadastrado...</option>
      ${registeredCustomers.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name} ${c.current_debt > 0 ? `(Dívida: ${c.current_debt.toFixed(2)} MT)` : ''}</option>`).join('')}
    `;

    renderCatalog();
  };

  // Eventos de controle
  searchInput.addEventListener('input', renderCatalog);
  discountInput.addEventListener('input', calculateTotals);
  cashTenderedInput.addEventListener('input', calculateTotals);

  clearCartBtn.addEventListener('click', () => {
    if (cart.length > 0 && confirm('Limpar itens do carrinho?')) {
      cart = [];
      renderCart();
    }
  });

  // Troca de método de pagamento
  paymentButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      paymentButtons.forEach(b => {
        b.className = 'pay-btn py-1.5 px-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-center';
      });
      btn.className = 'pay-btn active py-1.5 px-1 rounded-lg bg-orange-600 text-white border border-orange-500 text-center';
      selectedPaymentMethod = btn.dataset.method;
      calculateTotals();
    });
  });

  // Se selecionar um cliente do select, preenche o campo de texto do comprador automaticamente
  selectCustomer.addEventListener('change', () => {
    const selectedOpt = selectCustomer.options[selectCustomer.selectedIndex];
    if (selectCustomer.value && selectedOpt.dataset.name) {
      customerInput.value = selectedOpt.dataset.name;
    }
  });

  // Finalizar Venda Real no Supabase
  finalizeBtn.addEventListener('click', async () => {
    showAlert('');
    if (cart.length === 0) {
      showAlert('Adicione produtos ao carrinho antes de finalizar.');
      return;
    }

    const { subtotal, discount, total } = calculateTotals();

    // Requisito 17 e 18: Nome do comprador digitado ou padrão
    const buyerName = (customerInput.value || '').trim() || 'Consumidor Final';
    const customerId = selectCustomer.value || null;

    const client = getSupabase();
    const currentUser = getCurrentUser();
    if (!client) {
      showAlert('Supabase não conectado. Configure as credenciais para emitir vendas reais.');
      return;
    }

    finalizeBtn.disabled = true;
    finalizeBtn.innerHTML = `
      <i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i>
      <span>Gravando venda no PostgreSQL...</span>
    `;
    if (window.lucide) window.lucide.createIcons();

    try {
      const saleNumber = 'VEN-' + Math.floor(100000 + Math.random() * 900000);
      const storeId = getCurrentStoreId() || currentUser?.storeId;

      // 1. Inserir a venda em public.sales
      const { data: sale, error: saleError } = await client
        .from('sales')
        .insert({
          store_id: storeId,
          sale_number: saleNumber,
          customer_name: buyerName,
          customer_id: customerId,
          subtotal: subtotal,
          discount_amount: discount,
          total_net: total,
          payment_method: selectedPaymentMethod,
          cashier_name: currentUser?.fullName || 'GEF',
          created_by: currentUser?.id || null,
          status: 'COMPLETED'
        })
        .select()
        .single();

      if (saleError) throw new Error(formatErrorMessage(saleError));

      // 2. Inserir os itens em public.sale_items e abater estoque
      for (const item of cart) {
        await client.from('sale_items').insert({
          sale_id: sale.id,
          store_id: storeId,
          product_id: item.product_id,
          product_code: item.code,
          product_name: item.name,
          packaging_name: item.packaging_name,
          multiplier: item.multiplier || 1,
          quantity: item.quantity,
          quantity_base: item.quantity * (item.multiplier || 1),
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
          unit_cogs: item.unit_cogs || 0,
          total_cogs: item.quantity * (item.unit_cogs || 0)
        });

        // Registrar saída física de estoque
        await client.from('stock_movements').insert({
          store_id: storeId,
          product_id: item.product_id,
          movement_type: 'SALE',
          quantity_base: -item.quantity * (item.multiplier || 1),
          reference_id: sale.id,
          reason: `Venda ${saleNumber} realizada para ${buyerName}`,
          operator_name: currentUser?.fullName || 'GEF'
        });

        // Abater estoque na loja
        const prod = availableProducts.find(p => p.id === item.product_id);
        if (prod) {
          const newStock = Math.max(0, prod.current_stock_base - (item.quantity * (item.multiplier || 1)));
          await client.from('products').update({ current_stock_base: newStock }).eq('id', prod.id);
        }
      }

      // Se for fiado, adicionar à dívida do cliente se cadastrado
      if (selectedPaymentMethod === 'CREDITO_FIADO' && customerId) {
        const cust = registeredCustomers.find(c => c.id === customerId);
        if (cust) {
          const newDebt = (cust.current_debt || 0) + total;
          await client.from('customers').update({ current_debt: newDebt }).eq('id', customerId);
        }
      }

      // 3. Registrar auditoria
      await client.from('audit_logs').insert({
        store_id: storeId,
        user_id: currentUser?.id || null,
        operator_name: currentUser?.fullName || 'GEF',
        action: 'VENDA_CONCLUIDA',
        entity: 'sales',
        record_id: sale.id,
        details: {
          venda: saleNumber,
          cliente: buyerName,
          valor: total,
          itens_qtd: cart.length
        }
      });

      // 4. Disparar Recibo Térmico Real com o Nome do Cliente (Requisito 18)
      openReceiptModal({
        saleNumber,
        customerName: buyerName,
        cashierName: currentUser?.fullName || 'GEF',
        items: [...cart],
        subtotal,
        discount,
        total,
        paymentMethod: selectedPaymentMethod,
        date: new Date().toISOString()
      });

      // Limpar formulário de venda
      cart = [];
      customerInput.value = '';
      selectCustomer.value = '';
      discountInput.value = '0';
      cashTenderedInput.value = '';
      renderCart();

      // Recarregar dados para refletir o estoque atualizado
      await loadData();
    } catch (err) {
      showAlert(err.message || 'Erro ao gravar venda no banco.');
    } finally {
      finalizeBtn.disabled = false;
      finalizeBtn.innerHTML = `
        <i data-lucide="check-circle" class="w-4 h-4"></i>
        <span>Finalizar Venda & Emitir Recibo (F4)</span>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // Atalhos de teclado (F2 para buscar, F4 para finalizar, F8 para limpar)
  const handleKeydown = (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'F4') {
      e.preventDefault();
      finalizeBtn.click();
    } else if (e.key === 'F8') {
      e.preventDefault();
      clearCartBtn.click();
    }
  };
  window.addEventListener('keydown', handleKeydown);

  // Carregar dados iniciais
  await loadData();
}

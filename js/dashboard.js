/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Dashboard Operacional do ADMIN (js/dashboard.js)
 * Indicadores em tempo real consolidados diretamente no PostgreSQL / Supabase
 */

import { getSupabase, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { navigateTo } from './router.js';
import { getGefLogoSvg } from './logo.js';

/**
 * Consulta métricas reais consolidadas para a loja ativa
 */
export async function fetchDashboardMetrics() {
  const client = getSupabase();
  if (!client) return null;

  const storeId = getCurrentStoreId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // 1. Vendas de hoje
    let salesQuery = client
      .from('sales')
      .select('*')
      .gte('created_at', today.toISOString())
      .neq('status', 'CANCELADA');

    if (storeId && storeId !== 'ALL') {
      salesQuery = salesQuery.eq('store_id', storeId);
    }

    const { data: todaySales } = await salesQuery;

    const todayTotal = (todaySales || []).reduce((acc, s) => acc + Number(s.total_net || 0), 0);
    const todayCount = (todaySales || []).length;

    // 2. Produtos abaixo do estoque mínimo
    let prodQuery = client.from('products').select('*');
    if (storeId && storeId !== 'ALL') {
      prodQuery = prodQuery.eq('store_id', storeId);
    }
    const { data: prods } = await prodQuery;
    const lowStockCount = (prods || []).filter(p => Number(p.current_stock_base) <= Number(p.min_stock_base)).length;
    const totalProducts = (prods || []).length;

    // 3. Saldo devedor de clientes (Fiado)
    let custQuery = client.from('customers').select('current_debt');
    if (storeId && storeId !== 'ALL') {
      custQuery = custQuery.eq('store_id', storeId);
    }
    const { data: custs } = await custQuery;
    const totalDebt = (custs || []).reduce((acc, c) => acc + Number(c.current_debt || 0), 0);

    // 4. Últimas vendas recentes
    let recentSalesQuery = client
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6);

    if (storeId && storeId !== 'ALL') {
      recentSalesQuery = recentSalesQuery.eq('store_id', storeId);
    }
    const { data: recentSales } = await recentSalesQuery;

    return {
      todayTotal,
      todayCount,
      lowStockCount,
      totalProducts,
      totalDebt,
      recentSales: recentSales || []
    };
  } catch (err) {
    console.error('Erro ao consultar métricas do dashboard:', err);
    return null;
  }
}

/**
 * Renderiza o Dashboard do ADMIN
 */
export async function renderDashboardView(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="space-y-6 text-xs text-slate-200">
      <!-- Topo / Boas-vindas -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div class="flex items-center gap-3.5">
          ${getGefLogoSvg('icon', { className: 'w-10 h-10 shrink-0 drop-shadow-sm' })}
          <div>
            <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
              Painel de Gestão Operacional
            </h1>
            <p class="text-xs text-slate-400 mt-0.5">
              Bem-vindo, <strong>${user?.fullName || 'Administrador'}</strong>. Monitoramento em tempo real da loja.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnDashPos" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-950/40 transition active:scale-95">
            <i data-lucide="shopping-cart" class="w-4 h-4"></i>
            <span>Abrir PDV / Venda (F4)</span>
          </button>
          <button id="btnRefreshDash" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition" title="Atualizar Indicadores">
            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Grade de KPIs Operacionais -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Faturamento Hoje -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div class="flex items-center justify-between text-slate-400">
            <span class="font-bold text-[10px] uppercase font-mono">Faturamento Hoje</span>
            <div class="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/30">
              <i data-lucide="trending-up" class="w-4 h-4"></i>
            </div>
          </div>
          <div id="dashTodayRevenue" class="text-2xl font-black font-mono text-emerald-400">0.00 MT</div>
          <span id="dashTodayCount" class="text-[10px] text-slate-500 font-mono block">0 vendas hoje</span>
        </div>

        <!-- Alerta de Estoque -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 cursor-pointer hover:border-orange-500/40 transition" id="cardLowStock">
          <div class="flex items-center justify-between text-slate-400">
            <span class="font-bold text-[10px] uppercase font-mono">Itens Abaixo do Mínimo</span>
            <div class="p-2 rounded-lg bg-orange-950 text-orange-400 border border-orange-500/30">
              <i data-lucide="alert-triangle" class="w-4 h-4"></i>
            </div>
          </div>
          <div id="dashLowStockCount" class="text-2xl font-black font-mono text-orange-400">0</div>
          <span class="text-[10px] text-slate-500 block">Exigem reposição nos armazéns</span>
        </div>

        <!-- Total a Receber (Fiado) -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 cursor-pointer hover:border-amber-500/40 transition" id="cardCustomersDebt">
          <div class="flex items-center justify-between text-slate-400">
            <span class="font-bold text-[10px] uppercase font-mono">Contas a Receber (Fiado)</span>
            <div class="p-2 rounded-lg bg-amber-950 text-amber-400 border border-amber-500/30">
              <i data-lucide="users" class="w-4 h-4"></i>
            </div>
          </div>
          <div id="dashTotalDebt" class="text-2xl font-black font-mono text-amber-400">0.00 MT</div>
          <span class="text-[10px] text-slate-500 block">Dívidas ativas de obras e clientes</span>
        </div>

        <!-- Total de Materiais Cadastrados -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 cursor-pointer hover:border-blue-500/40 transition" id="cardProducts">
          <div class="flex items-center justify-between text-slate-400">
            <span class="font-bold text-[10px] uppercase font-mono">Catálogo de Materiais</span>
            <div class="p-2 rounded-lg bg-blue-950 text-blue-400 border border-blue-500/30">
              <i data-lucide="package" class="w-4 h-4"></i>
            </div>
          </div>
          <div id="dashTotalProducts" class="text-2xl font-black font-mono text-white">0</div>
          <span class="text-[10px] text-slate-500 block">Produtos registrados no sistema</span>
        </div>
      </div>

      <!-- Atalhos Rápidos & Vendas Recentes -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Vendas Recentes -->
        <div class="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-sm text-white flex items-center gap-2">
              <i data-lucide="history" class="w-4 h-4 text-orange-400"></i>
              <span>Últimas Vendas Concluídas</span>
            </h3>
            <button id="btnViewAllSales" class="text-[11px] font-semibold text-orange-400 hover:text-orange-300 transition">
              Ver Todas &rarr;
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-slate-800/80 text-[10px] font-bold text-slate-400 uppercase font-mono border-b border-slate-700">
                <tr>
                  <th class="py-2.5 px-3">Venda</th>
                  <th class="py-2.5 px-3">Cliente</th>
                  <th class="py-2.5 px-3">Pagamento</th>
                  <th class="py-2.5 px-3 text-right">Total</th>
                  <th class="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="dashRecentSalesBody" class="divide-y divide-slate-800/80">
                <tr>
                  <td colspan="5" class="py-8 text-center text-slate-500">
                    <i data-lucide="refresh-cw" class="w-5 h-5 animate-spin mx-auto text-orange-500 mb-1"></i>
                    Carregando vendas recentes...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Painel de Ações Rápidas -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 class="font-bold text-sm text-white flex items-center gap-2">
            <i data-lucide="zap" class="w-4 h-4 text-orange-400"></i>
            <span>Operações Imediatas</span>
          </h3>
          <div class="space-y-2">
            <button id="quickBtnNewProduct" class="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left flex items-center gap-3 transition">
              <div class="p-2 rounded-lg bg-orange-950 text-orange-400 border border-orange-500/20">
                <i data-lucide="plus" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="font-bold text-white text-xs">Novo Material de Construção</div>
                <span class="text-[10px] text-slate-400">Cadastre cimento, varão, areia com conversões</span>
              </div>
            </button>

            <button id="quickBtnStockTransfer" class="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left flex items-center gap-3 transition">
              <div class="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/20">
                <i data-lucide="arrow-left-right" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="font-bold text-white text-xs">Transferir entre Armazéns</div>
                <span class="text-[10px] text-slate-400">Movimente entre Armazém, Pátio e Loja</span>
              </div>
            </button>

            <button id="quickBtnReports" class="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left flex items-center gap-3 transition">
              <div class="p-2 rounded-lg bg-blue-950 text-blue-400 border border-blue-500/20">
                <i data-lucide="bar-chart-3" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="font-bold text-white text-xs">Demonstrativo Financeiro</div>
                <span class="text-[10px] text-slate-400">DRE, lucro bruto e curva ABC</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const todayRevenue = container.querySelector('#dashTodayRevenue');
  const todayCount = container.querySelector('#dashTodayCount');
  const lowStockCount = container.querySelector('#dashLowStockCount');
  const totalDebt = container.querySelector('#dashTotalDebt');
  const totalProducts = container.querySelector('#dashTotalProducts');
  const recentSalesBody = container.querySelector('#dashRecentSalesBody');
  const refreshBtn = container.querySelector('#btnRefreshDash');
  const posBtn = container.querySelector('#btnDashPos');

  const loadData = async () => {
    const data = await fetchDashboardMetrics();
    if (!data) {
      recentSalesBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500">Nenhum dado encontrado.</td></tr>`;
      return;
    }

    todayRevenue.textContent = `${data.todayTotal.toFixed(2)} MT`;
    todayCount.textContent = `${data.todayCount} venda(s) registrada(s) hoje`;
    lowStockCount.textContent = data.lowStockCount;
    totalDebt.textContent = `${data.totalDebt.toFixed(2)} MT`;
    totalProducts.textContent = data.totalProducts;

    if (data.recentSales.length === 0) {
      recentSalesBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-slate-500">
            Nenhuma venda registrada até o momento.
          </td>
        </tr>
      `;
      return;
    }

    recentSalesBody.innerHTML = data.recentSales.map(s => {
      const isCanceled = s.status === 'CANCELADA';
      return `
        <tr class="hover:bg-slate-800/40 transition ${isCanceled ? 'opacity-50' : ''}">
          <td class="py-2.5 px-3 font-mono font-bold text-white">${s.sale_number}</td>
          <td class="py-2.5 px-3 font-medium text-slate-200">${s.customer_name || 'Consumidor Final'}</td>
          <td class="py-2.5 px-3 text-slate-400 font-mono text-[10px]">${s.payment_method}</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">${Number(s.total_net).toFixed(2)} MT</td>
          <td class="py-2.5 px-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${isCanceled ? 'bg-red-950 text-red-400' : 'bg-emerald-950 text-emerald-400'}">
              ${isCanceled ? 'ESTORNADA' : 'CONCLUÍDA'}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  };

  posBtn.addEventListener('click', () => navigateTo('/pos'));
  container.querySelector('#btnViewAllSales').addEventListener('click', () => navigateTo('/sales'));
  container.querySelector('#cardLowStock').addEventListener('click', () => navigateTo('/stock'));
  container.querySelector('#cardCustomersDebt').addEventListener('click', () => navigateTo('/customers'));
  container.querySelector('#cardProducts').addEventListener('click', () => navigateTo('/products'));

  container.querySelector('#quickBtnNewProduct').addEventListener('click', () => navigateTo('/products'));
  container.querySelector('#quickBtnStockTransfer').addEventListener('click', () => navigateTo('/stock'));
  container.querySelector('#quickBtnReports').addEventListener('click', () => navigateTo('/reports'));

  refreshBtn.addEventListener('click', loadData);

  await loadData();
}

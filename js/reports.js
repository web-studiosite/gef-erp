/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Relatórios Financeiros & Curva ABC (js/reports.js)
 * Consultas analíticas consolidadas no PostgreSQL
 */

import { getSupabase, getCurrentStoreId } from './supabase.js';

/**
 * Consulta e consolida os relatórios de vendas e lucratividade
 */
export async function fetchReportData(periodDays = 30) {
  const client = getSupabase();
  if (!client) return null;

  const storeId = getCurrentStoreId();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  try {
    let query = client
      .from('sales')
      .select('*, sale_items(*)')
      .gte('created_at', startDate.toISOString())
      .neq('status', 'CANCELADA');

    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }

    const { data: sales, error } = await query;
    if (error) throw error;

    let grossRevenue = 0;
    let totalDiscounts = 0;
    let netRevenue = 0;
    let totalCogs = 0;
    const paymentMethods = {};
    const productStats = {};

    (sales || []).forEach(sale => {
      grossRevenue += Number(sale.subtotal || sale.total_net || 0);
      totalDiscounts += Number(sale.discount_amount || 0);
      netRevenue += Number(sale.total_net || 0);

      const m = sale.payment_method || 'OUTRO';
      paymentMethods[m] = (paymentMethods[m] || 0) + Number(sale.total_net || 0);

      (sale.sale_items || []).forEach(item => {
        const cogs = Number(item.total_cogs || 0);
        totalCogs += cogs;

        const pId = item.product_id || item.product_name;
        if (!productStats[pId]) {
          productStats[pId] = {
            name: item.product_name,
            qty: 0,
            revenue: 0,
            cogs: 0
          };
        }
        productStats[pId].qty += Number(item.quantity || 0);
        productStats[pId].revenue += Number(item.total_price || 0);
        productStats[pId].cogs += cogs;
      });
    });

    const grossProfit = netRevenue - totalCogs;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      salesCount: (sales || []).length,
      grossRevenue,
      totalDiscounts,
      netRevenue,
      totalCogs,
      grossProfit,
      grossMargin,
      paymentMethods,
      topProducts
    };
  } catch (err) {
    console.error('Erro ao gerar relatório:', err);
    return null;
  }
}

/**
 * Renderiza a tela de Relatórios
 */
export async function renderReportsView(container) {
  container.innerHTML = `
    <div class="space-y-6 text-xs text-slate-200">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="bar-chart-3" class="w-5 h-5 text-orange-400"></i>
            Relatórios Financeiros, DRE Simplificado & Curva ABC
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Apuramento de receita líquida, CMV (Custo das Mercadorias Vendidas) e margem bruta real.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <select id="reportPeriodSelect" class="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-semibold focus:outline-hidden">
            <option value="1">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30" selected>Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <button id="btnPrintReport" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition shadow-sm">
            <i data-lucide="printer" class="w-4 h-4"></i>
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      <!-- Métricas Resumo -->
      <div id="reportMetricsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Receita Líquida</span>
          <span id="repNetRevenue" class="text-2xl font-extrabold font-mono text-emerald-400 mt-1 block">0.00 MT</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">CMV (Custo Mercadorias)</span>
          <span id="repTotalCogs" class="text-2xl font-extrabold font-mono text-slate-300 mt-1 block">0.00 MT</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Lucro Bruto (Margem)</span>
          <span id="repGrossProfit" class="text-2xl font-extrabold font-mono text-orange-400 mt-1 block">0.00 MT</span>
          <span id="repMarginPct" class="text-[10px] text-slate-400 font-mono">Margem: 0%</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Descontos Concedidos</span>
          <span id="repDiscounts" class="text-2xl font-extrabold font-mono text-amber-400 mt-1 block">0.00 MT</span>
        </div>
      </div>

      <!-- Top Produtos & Meios de Pagamento -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Ranking Top Produtos -->
        <div class="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 class="font-bold text-sm text-white flex items-center gap-2">
            <i data-lucide="trending-up" class="w-4 h-4 text-orange-400"></i>
            <span>Curva ABC — Top Materiais Mais Faturados</span>
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-slate-800/80 text-[10px] font-bold text-slate-400 uppercase font-mono border-b border-slate-700">
                <tr>
                  <th class="py-2.5 px-3">Material</th>
                  <th class="py-2.5 px-3 text-center">Qtd Vendida</th>
                  <th class="py-2.5 px-3 text-right">Faturamento</th>
                  <th class="py-2.5 px-3 text-right">Lucro Estimado</th>
                </tr>
              </thead>
              <tbody id="repTopProductsBody" class="divide-y divide-slate-800/80">
                <tr>
                  <td colspan="4" class="py-8 text-center text-slate-500">Carregando indicadores...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Meios de Pagamento -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 class="font-bold text-sm text-white flex items-center gap-2">
            <i data-lucide="wallet" class="w-4 h-4 text-orange-400"></i>
            <span>Vendas por Meio de Pagamento</span>
          </h3>
          <div id="repPaymentMethodsList" class="space-y-2 pt-2">
            <div class="text-slate-500 text-center py-6">Carregando...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const periodSelect = container.querySelector('#reportPeriodSelect');
  const printBtn = container.querySelector('#btnPrintReport');
  const repNetRevenue = container.querySelector('#repNetRevenue');
  const repTotalCogs = container.querySelector('#repTotalCogs');
  const repGrossProfit = container.querySelector('#repGrossProfit');
  const repMarginPct = container.querySelector('#repMarginPct');
  const repDiscounts = container.querySelector('#repDiscounts');
  const topProductsBody = container.querySelector('#repTopProductsBody');
  const paymentMethodsList = container.querySelector('#repPaymentMethodsList');

  const loadData = async () => {
    const period = Number(periodSelect.value) || 30;
    const report = await fetchReportData(period);

    if (!report || report.salesCount === 0) {
      repNetRevenue.textContent = '0.00 MT';
      repTotalCogs.textContent = '0.00 MT';
      repGrossProfit.textContent = '0.00 MT';
      repMarginPct.textContent = 'Margem: 0%';
      repDiscounts.textContent = '0.00 MT';

      topProductsBody.innerHTML = `
        <tr>
          <td colspan="4" class="py-8 text-center text-slate-500">
            Nenhum dado encontrado no período selecionado.
          </td>
        </tr>
      `;
      paymentMethodsList.innerHTML = '<div class="text-slate-500 text-center py-6">Nenhum pagamento registrado.</div>';
      return;
    }

    repNetRevenue.textContent = `${report.netRevenue.toFixed(2)} MT`;
    repTotalCogs.textContent = `${report.totalCogs.toFixed(2)} MT`;
    repGrossProfit.textContent = `${report.grossProfit.toFixed(2)} MT`;
    repMarginPct.textContent = `Margem Bruta: ${report.grossMargin.toFixed(1)}%`;
    repDiscounts.textContent = `${report.totalDiscounts.toFixed(2)} MT`;

    topProductsBody.innerHTML = report.topProducts.map(p => {
      const profit = p.revenue - p.cogs;
      return `
        <tr class="hover:bg-slate-800/40">
          <td class="py-2.5 px-3 font-semibold text-white">${p.name}</td>
          <td class="py-2.5 px-3 text-center font-mono font-bold">${p.qty}</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">${p.revenue.toFixed(2)} MT</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold text-orange-400">${profit.toFixed(2)} MT</td>
        </tr>
      `;
    }).join('');

    paymentMethodsList.innerHTML = Object.entries(report.paymentMethods).map(([method, val]) => {
      const pct = report.netRevenue > 0 ? ((val / report.netRevenue) * 100).toFixed(1) : 0;
      return `
        <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-white block">${method}</span>
            <span class="text-[10px] text-slate-400 font-mono">${pct}% do faturamento</span>
          </div>
          <span class="font-mono font-extrabold text-orange-400">${val.toFixed(2)} MT</span>
        </div>
      `;
    }).join('');
  };

  periodSelect.addEventListener('change', loadData);
  printBtn.addEventListener('click', () => window.print());

  await loadData();
}

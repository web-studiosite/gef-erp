/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Monitor Global Multi-Tenant do SUPERADMIN (js/monitor.js)
 * Requisitos 3, 4 e 9: Visão global consolidada de todas as lojas e alternância de contexto
 */

import { getSupabase, setCurrentStoreId, getCurrentStoreId } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { navigateTo } from './router.js';
import { getGefLogoSvg } from './logo.js';

/**
 * Consulta dados globais consolidados de todas as filiais
 */
export async function fetchGlobalSaaSData() {
  const client = getSupabase();
  if (!client) return null;

  try {
    // 1. Todas as lojas
    const { data: stores, error: sErr } = await client
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false });

    // 2. Todos os operadores
    const { count: usersCount } = await client
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 3. Vendas globais
    const { data: allSales } = await client
      .from('sales')
      .select('total_net, status');

    const totalVolume = (allSales || [])
      .filter(s => s.status !== 'CANCELADA')
      .reduce((acc, s) => acc + Number(s.total_net || 0), 0);

    const activeStores = (stores || []).filter(s => s.active !== false).length;

    return {
      stores: stores || [],
      usersCount: usersCount || 0,
      totalVolume,
      activeStores,
      totalSalesCount: (allSales || []).length
    };
  } catch (err) {
    console.error('Erro ao consultar monitor global:', err);
    return null;
  }
}

/**
 * Renderiza o Monitor Global do SUPERADMIN
 */
export async function renderMonitorView(container) {
  const user = getCurrentUser();
  const currentStoreId = getCurrentStoreId();

  container.innerHTML = `
    <div class="space-y-6 text-xs text-slate-200">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div class="flex items-center gap-3.5">
          ${getGefLogoSvg('icon', { className: 'w-10 h-10 shrink-0 drop-shadow-sm' })}
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-950 text-orange-400 border border-orange-500/30">
                SaaS Multi-Tenant Global
              </span>
              <span class="text-xs text-slate-400 font-mono">Painel de Comando</span>
            </div>
            <h1 class="text-xl font-extrabold text-white flex items-center gap-2 mt-1">
              Monitor Global de Lojas & Infraestrutura
            </h1>
            <p class="text-xs text-slate-400 mt-0.5">
              Visão irrestrita de todas as instâncias comerciais ativas no PostgreSQL / Supabase.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnRefreshMonitor" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <!-- Métricas Globais -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span class="text-[10px] font-bold text-slate-400 uppercase font-mono">Total de Lojas</span>
          <div id="monTotalStores" class="text-2xl font-black font-mono text-white">0</div>
          <span id="monActiveStores" class="text-[10px] text-emerald-400 font-semibold block">0 ativas</span>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span class="text-[10px] font-bold text-slate-400 uppercase font-mono">Volume Total Transacionado</span>
          <div id="monTotalVolume" class="text-2xl font-black font-mono text-emerald-400">0.00 MT</div>
          <span id="monSalesCount" class="text-[10px] text-slate-400 font-mono block">0 vendas processadas</span>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span class="text-[10px] font-bold text-slate-400 uppercase font-mono">Total de Operadores</span>
          <div id="monTotalUsers" class="text-2xl font-black font-mono text-amber-400">0</div>
          <span class="text-[10px] text-slate-400 block">Usuários no ecossistema</span>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span class="text-[10px] font-bold text-slate-400 uppercase font-mono">Contexto de Inspeção</span>
          <div id="monCurrentContext" class="text-xs font-bold text-orange-400 font-mono truncate">
            ${currentStoreId ? 'Loja Selecionada' : 'Global (Todas)'}
          </div>
          <button id="btnResetContextGlobal" class="text-[10px] text-slate-400 hover:text-white underline pt-0.5">
            Resetar para Visão Global
          </button>
        </div>
      </div>

      <!-- Tabela de Lojas -->
      <div class="space-y-3">
        <h3 class="font-bold text-sm text-white flex items-center gap-2">
          <i data-lucide="store" class="w-4 h-4 text-orange-400"></i>
          <span>Lojas e Instâncias Multi-Tenant Registradas</span>
        </h3>

        <div class="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-slate-800/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-700">
                <tr>
                  <th class="py-3 px-4">Código</th>
                  <th class="py-3 px-4">Nome da Empresa</th>
                  <th class="py-3 px-4">Plano</th>
                  <th class="py-3 px-4">Criada em</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4 text-center">Inspecionar Loja</th>
                </tr>
              </thead>
              <tbody id="monStoresTableBody" class="divide-y divide-slate-800/80">
                <tr>
                  <td colspan="6" class="py-12 text-center text-slate-500">
                    <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
                    Carregando lojas cadastradas do banco...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const totalStores = container.querySelector('#monTotalStores');
  const activeStores = container.querySelector('#monActiveStores');
  const totalVolume = container.querySelector('#monTotalVolume');
  const salesCount = container.querySelector('#monSalesCount');
  const totalUsers = container.querySelector('#monTotalUsers');
  const currentContext = container.querySelector('#monCurrentContext');
  const resetContextBtn = container.querySelector('#btnResetContextGlobal');
  const tableBody = container.querySelector('#monStoresTableBody');
  const refreshBtn = container.querySelector('#btnRefreshMonitor');

  const loadData = async () => {
    const data = await fetchGlobalSaaSData();
    if (!data) {
      tableBody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-500">Nenhum dado encontrado.</td></tr>`;
      return;
    }

    totalStores.textContent = data.stores.length;
    activeStores.textContent = `${data.activeStores} loja(s) ativa(s)`;
    totalVolume.textContent = `${data.totalVolume.toFixed(2)} MT`;
    salesCount.textContent = `${data.totalSalesCount} transações registradas`;
    totalUsers.textContent = data.usersCount;

    if (data.stores.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="py-12 text-center text-slate-500">
            Nenhuma loja cadastrada até o momento.
          </td>
        </tr>
      `;
      return;
    }

    const curStore = getCurrentStoreId();
    currentContext.textContent = curStore && curStore !== 'ALL'
      ? (data.stores.find(s => s.id === curStore)?.name || curStore)
      : 'Visão Global (Todas as Lojas)';

    tableBody.innerHTML = data.stores.map(st => {
      const isCurrent = curStore === st.id;
      return `
        <tr class="hover:bg-slate-800/40 transition ${isCurrent ? 'bg-orange-950/20' : ''}">
          <td class="py-3 px-4 font-mono font-bold text-orange-400">
            ${st.code || 'LOJA'}
          </td>
          <td class="py-3 px-4 font-bold text-white">
            ${st.name}
            ${st.city ? `<span class="block text-[10px] text-slate-400 font-normal">${st.city}</span>` : ''}
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-orange-400 border border-slate-700">
              ${st.plan_id || 'FREE'}
            </span>
          </td>
          <td class="py-3 px-4 font-mono text-slate-400">
            ${st.created_at ? new Date(st.created_at).toLocaleDateString('pt-PT') : '-'}
          </td>
          <td class="py-3 px-4 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              st.active !== false ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-red-950 text-red-400 border border-red-500/30'
            }">
              ${st.active !== false ? 'ATIVA' : 'SUSPENSA'}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <button class="btn-select-store px-3 py-1 rounded-lg text-xs font-semibold transition ${
              isCurrent
                ? 'bg-orange-600 text-white font-bold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }" data-id="${st.id}" data-name="${st.name}">
              ${isCurrent ? 'Loja Ativa' : 'Entrar nesta Loja'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('.btn-select-store').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        setCurrentStoreId(id);
        alert(`Contexto alternado com sucesso para a loja: ${btn.dataset.name}.\nVocê pode agora navegar pelos módulos operacionais desta filial.`);
        loadData();
      });
    });
  };

  resetContextBtn.addEventListener('click', () => {
    setCurrentStoreId('ALL');
    alert('Contexto redefinido para Visão Global.');
    loadData();
  });

  refreshBtn.addEventListener('click', loadData);

  await loadData();
}

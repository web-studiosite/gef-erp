/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Trilha de Auditoria & Conformidade (js/audit.js)
 * Requisito 21: Registro e consulta de ações críticas
 * Normalização do operador para "GEF" se for nulo ou direto no SQL
 */

import { getSupabase, getCurrentStoreId } from './supabase.js';

let auditCache = [];

/**
 * Consulta os logs de auditoria no Supabase
 */
export async function fetchAuditLogs(limit = 100) {
  const client = getSupabase();
  if (!client) return [];

  const storeId = getCurrentStoreId();
  try {
    let query = client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (storeId && storeId !== 'ALL') {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar auditoria:', error);
      return [];
    }

    auditCache = (data || []).map(log => ({
      ...log,
      operator_name: log.operator_name || 'GEF' // Requisito 21: Nunca vazio, usar GEF
    }));

    return auditCache;
  } catch (err) {
    console.error('Falha ao consultar auditoria:', err);
    return [];
  }
}

/**
 * Renderiza a view de Trilha de Auditoria
 */
export async function renderAuditView(container) {
  container.innerHTML = `
    <div class="space-y-5 text-xs text-slate-200">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="shield-alert" class="w-5 h-5 text-orange-400"></i>
            Trilha de Auditoria & Rastreabilidade de Operações
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Registro imutável de vendas, estornos, movimentações de armazém e operadores com carimbo de data/hora.
          </p>
        </div>
        <button id="btnRefreshAudit" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition border border-slate-700">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
          <span>Atualizar Auditoria</span>
        </button>
      </div>

      <!-- Filtro de Busca -->
      <div class="relative">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
        <input
          type="text"
          id="auditSearchInput"
          placeholder="Filtrar por ação (ESTORNO, VENDA, AJUSTE), operador (ex: GEF) ou entidade..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-orange-500"
        />
      </div>

      <!-- Tabela de Logs -->
      <div class="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-700">
              <tr>
                <th class="py-3 px-4">Data / Hora</th>
                <th class="py-3 px-4">Operador Responsável</th>
                <th class="py-3 px-4">Ação Executada</th>
                <th class="py-3 px-4">Módulo / Tabela</th>
                <th class="py-3 px-4">Detalhes do Evento</th>
              </tr>
            </thead>
            <tbody id="auditTableBody" class="divide-y divide-slate-800/80">
              <tr>
                <td colspan="5" class="py-12 text-center text-slate-500">
                  <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
                  Carregando trilha de auditoria...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = container.querySelector('#auditSearchInput');
  const tableBody = container.querySelector('#auditTableBody');
  const refreshBtn = container.querySelector('#btnRefreshAudit');

  let logsList = [];

  const updateTable = () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    const filtered = logsList.filter(l => {
      if (!q) return true;
      const op = (l.operator_name || 'GEF').toLowerCase();
      const ac = (l.action || '').toLowerCase();
      const en = (l.entity || '').toLowerCase();
      const det = JSON.stringify(l.details || {}).toLowerCase();
      return op.includes(q) || ac.includes(q) || en.includes(q) || det.includes(q);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-12 text-center text-slate-500">
            Nenhum dado encontrado.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(log => {
      const opName = log.operator_name || 'GEF';
      const isGefSystem = opName.toUpperCase() === 'GEF';
      const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('pt-PT') : '-';
      const detailsStr = log.details ? JSON.stringify(log.details) : '-';

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
            ${dateStr}
          </td>
          <td class="py-3 px-4 font-bold text-white flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded font-mono text-[10px] ${
              isGefSystem ? 'bg-orange-950 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-slate-300'
            }">
              ${opName}
            </span>
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
              ${log.action}
            </span>
          </td>
          <td class="py-3 px-4 font-mono text-slate-400 uppercase text-[10px]">
            ${log.entity}
          </td>
          <td class="py-3 px-4 text-slate-300 font-mono text-[11px] max-w-xs truncate" title="${detailsStr}">
            ${detailsStr}
          </td>
        </tr>
      `;
    }).join('');
  };

  const loadData = async () => {
    logsList = await fetchAuditLogs();
    updateTable();
  };

  searchInput.addEventListener('input', updateTable);
  refreshBtn.addEventListener('click', loadData);

  await loadData();
}

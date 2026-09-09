/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Gestão de Caixa, Turnos e Sangrias (js/cash.js)
 * 
 * Controle completo de abertura, sangrias, suprimentos e fechamento cego de caixa.
 */

import { getSupabase, getCurrentStoreId, formatErrorMessage } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { fetchStoreConfig } from './settings.js';
import { getGefLogoSvg } from './logo.js';

let activeCashSession = null;

/**
 * Consulta a sessão de caixa atualmente aberta para a loja
 */
async function fetchCurrentCashSession(storeId) {
  const client = getSupabase();
  if (!client || !storeId) return null;

  try {
    const { data, error } = await client
      .from('cash_sessions')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao consultar sessão de caixa ativa:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('Falha na consulta de cash_sessions:', e);
    return null;
  }
}

/**
 * Consulta movimentações de sangria e suprimento da sessão atual
 */
async function fetchSessionMovements(sessionId) {
  const client = getSupabase();
  if (!client || !sessionId) return [];

  try {
    const { data, error } = await client
      .from('cash_movements')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Consulta histórico de sessões encerradas
 */
async function fetchRecentSessions(storeId) {
  const client = getSupabase();
  if (!client || !storeId) return [];

  try {
    const { data, error } = await client
      .from('cash_sessions')
      .select('*')
      .eq('store_id', storeId)
      .order('opened_at', { ascending: false })
      .limit(10);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Renderiza a view de Caixa & Turnos
 */
export async function renderCashView(container) {
  const user = getCurrentUser();
  const storeId = getCurrentStoreId();
  const store = await fetchStoreConfig();
  const currency = store?.currency || 'MT';

  container.innerHTML = `
    <div class="py-8 text-center text-slate-500 text-xs">
      <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
      Carregando dados de caixa e turnos...
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  activeCashSession = await fetchCurrentCashSession(storeId);
  const movements = activeCashSession ? await fetchSessionMovements(activeCashSession.id) : [];
  const recentSessions = await fetchRecentSessions(storeId);

  // Calcular saldo esperado
  const initialCash = Number(activeCashSession?.initial_cash || 0);
  const salesCash = Number(activeCashSession?.total_sales_cash || 0);
  const totalSangrias = Number(activeCashSession?.total_sangrias || 0);
  const totalSuprimentos = Number(activeCashSession?.total_entries || 0);
  const expectedCash = initialCash + salesCash + totalSuprimentos - totalSangrias;

  container.innerHTML = `
    <div class="space-y-6 text-xs text-slate-200">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div class="flex items-center gap-3.5">
          ${getGefLogoSvg('icon', { className: 'w-10 h-10 shrink-0 drop-shadow-sm' })}
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${activeCashSession ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-red-950 text-red-400 border border-red-500/30'}">
                ${activeCashSession ? 'CAIXA ABERTO' : 'CAIXA FECHADO'}
              </span>
              <span class="text-xs text-slate-400 font-mono">${store?.name || 'Filial Principal'}</span>
            </div>
            <h1 class="text-xl font-extrabold text-white flex items-center gap-2 mt-1">
              Controle de Caixa & Fechamento de Turno
            </h1>
            <p class="text-xs text-slate-400 mt-0.5">
              Gestão de fundos de maneio, sangrias, suprimentos e conferência cega de valores.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${!activeCashSession ? `
            <button id="btnOpenCashSession" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 transition active:scale-95">
              <i data-lucide="unlock" class="w-3.5 h-3.5"></i>
              <span>Abrir Novo Turno</span>
            </button>
          ` : `
            <button id="btnAddSangria" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold transition">
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
              <span>Sangria (Retirada)</span>
            </button>
            <button id="btnAddSuprimento" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition">
              <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i>
              <span>Suprimento (Aporte)</span>
            </button>
            <button id="btnCloseCashSession" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold shadow-md shadow-red-950/40 transition active:scale-95">
              <i data-lucide="lock" class="w-3.5 h-3.5"></i>
              <span>Fechar Turno</span>
            </button>
          `}
        </div>
      </div>

      <!-- Resumo do Turno Ativo -->
      ${activeCashSession ? `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 text-[10px] font-mono uppercase block">Fundo de Maneio</span>
            <div class="text-lg font-black text-white mt-1">
              ${initialCash.toFixed(2)} <span class="text-xs font-normal text-slate-400">${currency}</span>
            </div>
            <span class="text-[10px] text-slate-500 mt-1 block">Aberto às ${new Date(activeCashSession.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 text-[10px] font-mono uppercase block">Vendas em Dinheiro</span>
            <div class="text-lg font-black text-emerald-400 mt-1">
              +${salesCash.toFixed(2)} <span class="text-xs font-normal text-slate-400">${currency}</span>
            </div>
            <span class="text-[10px] text-slate-500 mt-1 block">Recebimentos no PDV</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 text-[10px] font-mono uppercase block">Sangrias Realizadas</span>
            <div class="text-lg font-black text-amber-400 mt-1">
              -${totalSangrias.toFixed(2)} <span class="text-xs font-normal text-slate-400">${currency}</span>
            </div>
            <span class="text-[10px] text-slate-500 mt-1 block">Transferências para cofre</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-900 border border-orange-500/30 bg-gradient-to-br from-slate-900 to-orange-950/20">
            <span class="text-orange-400 text-[10px] font-mono uppercase font-bold block">Saldo Físico em Gaveta</span>
            <div class="text-xl font-black text-white mt-1">
              ${expectedCash.toFixed(2)} <span class="text-xs font-normal text-orange-400">${currency}</span>
            </div>
            <span class="text-[10px] text-slate-400 mt-1 block">Operador: ${activeCashSession.cashier_name || user?.fullName}</span>
          </div>
        </div>
      ` : `
        <div class="p-8 rounded-3xl bg-slate-900/60 border border-dashed border-slate-800 text-center space-y-3">
          <div class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
            <i data-lucide="lock" class="w-6 h-6"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">Nenhum Turno de Caixa Aberto no Momento</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Para realizar vendas no PDV e registrar movimentações de moeda corrente, inicie um novo turno informando o fundo de maneio inicial.
            </p>
          </div>
          <button id="btnOpenCashSessionEmpty" class="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-orange-950/50 transition">
            <i data-lucide="unlock" class="w-4 h-4"></i>
            <span>Iniciar Turno de Caixa Agora</span>
          </button>
        </div>
      `}

      <!-- Movimentações do Turno e Histórico de Sessões -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Tabela de Sangrias / Suprimentos -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              <i data-lucide="arrow-down-up" class="w-4 h-4 text-orange-400"></i>
              Movimentações do Turno Atual
            </h2>
            <span class="text-[10px] font-mono text-slate-400">${movements.length} registro(s)</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="border-b border-slate-800 text-slate-400 text-[10px] font-mono uppercase">
                  <th class="pb-2">Tipo</th>
                  <th class="pb-2">Motivo</th>
                  <th class="pb-2 text-right">Valor (${currency})</th>
                  <th class="pb-2 text-right">Hora</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 text-xs">
                ${movements.length === 0 ? `
                  <tr>
                    <td colspan="4" class="py-6 text-center text-slate-500 text-xs">
                      Nenhuma sangria ou suprimento lançado neste turno.
                    </td>
                  </tr>
                ` : movements.map(m => `
                  <tr>
                    <td class="py-2.5">
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${m.movement_type === 'SANGRIA' ? 'bg-amber-950 text-amber-400 border border-amber-500/30' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'}">
                        ${m.movement_type}
                      </span>
                    </td>
                    <td class="py-2.5 text-slate-300">${m.reason}</td>
                    <td class="py-2.5 text-right font-mono font-bold ${m.movement_type === 'SANGRIA' ? 'text-amber-400' : 'text-emerald-400'}">
                      ${m.movement_type === 'SANGRIA' ? '-' : '+'}${Number(m.amount).toFixed(2)}
                    </td>
                    <td class="py-2.5 text-right font-mono text-slate-400 text-[11px]">
                      ${new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Histórico dos Últimos Turnos -->
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              <i data-lucide="history" class="w-4 h-4 text-orange-400"></i>
              Histórico Recente de Fechamentos
            </h2>
            <span class="text-[10px] font-mono text-slate-400">Últimos ${recentSessions.length} turnos</span>
          </div>

          <div class="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            ${recentSessions.length === 0 ? `
              <div class="py-6 text-center text-slate-500 text-xs">
                Nenhum histórico registrado no banco de dados.
              </div>
            ` : recentSessions.map(s => {
              const isOpen = s.status === 'OPEN';
              const diff = Number(s.cash_difference || 0);
              return `
                <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between">
                  <div class="space-y-0.5">
                    <div class="flex items-center gap-2">
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${isOpen ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'}">
                        ${isOpen ? 'EM ANDAMENTO' : 'ENCERRADO'}
                      </span>
                      <span class="font-bold text-white text-xs">${s.cashier_name || 'Operador'}</span>
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono">
                      Abertura: ${new Date(s.opened_at).toLocaleDateString('pt-BR')} às ${new Date(s.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div class="text-right font-mono">
                    <div class="text-xs font-bold text-white">
                      Vendas: ${Number(s.total_sales_cash || 0).toFixed(2)} ${currency}
                    </div>
                    ${!isOpen ? `
                      <span class="text-[10px] ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-400' : 'text-rose-400'}">
                        ${diff === 0 ? 'Conferência Exata' : (diff > 0 ? `Sobra: +${diff.toFixed(2)}` : `Falta: ${diff.toFixed(2)}`)}
                      </span>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Ouvintes de Modais e Ações
  setupCashActionListeners(container, storeId, currency, user);
}

function setupCashActionListeners(container, storeId, currency, user) {
  const openButtons = [
    container.querySelector('#btnOpenCashSession'),
    container.querySelector('#btnOpenCashSessionEmpty')
  ];

  openButtons.forEach(btn => {
    btn?.addEventListener('click', () => {
      openCashSessionModal(container, storeId, currency, user);
    });
  });

  container.querySelector('#btnAddSangria')?.addEventListener('click', () => {
    openMovementModal('SANGRIA', storeId, currency, user);
  });

  container.querySelector('#btnAddSuprimento')?.addEventListener('click', () => {
    openMovementModal('SUPRIMENTO', storeId, currency, user);
  });

  container.querySelector('#btnCloseCashSession')?.addEventListener('click', () => {
    openCloseSessionModal(storeId, currency, user);
  });
}

/**
 * Modal para Abertura de Turno
 */
function openCashSessionModal(viewContainer, storeId, currency, user) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs';
  modal.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-200 text-xs space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <i data-lucide="unlock" class="w-4 h-4 text-emerald-400"></i>
          Abertura de Turno de Caixa
        </h3>
        <button id="btnCancelOpenCash" class="p-1 text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <form id="formOpenCash" class="space-y-4">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Operador Responsável</label>
          <input type="text" value="${user?.fullName || 'Caixa'}" readonly class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-xs" />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Fundo de Maneio Inicial (${currency}) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            id="cashInitialAmount"
            required
            value="0.00"
            class="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:border-orange-500 focus:outline-hidden"
          />
          <span class="text-[10px] text-slate-400 mt-1 block">Valor em notas e moedas presente na gaveta no início do expediente.</span>
        </div>

        <button type="submit" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold text-xs shadow-md transition">
          Confirmar e Abrir Turno
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#btnCancelOpenCash')?.addEventListener('click', close);

  modal.querySelector('#formOpenCash')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const initialCash = Number(modal.querySelector('#cashInitialAmount').value) || 0;
    const client = getSupabase();

    if (client) {
      try {
        await client.from('cash_sessions').insert({
          store_id: storeId,
          cashier_id: user?.id,
          cashier_name: user?.fullName || 'GEF',
          opened_at: new Date().toISOString(),
          initial_cash: initialCash,
          expected_cash: initialCash,
          status: 'OPEN'
        });
      } catch (err) {
        console.error('Erro ao abrir turno:', err);
      }
    }

    close();
    renderCashView(viewContainer);
  });
}

/**
 * Modal para Sangria ou Suprimento
 */
function openMovementModal(type, storeId, currency, user) {
  const isSangria = type === 'SANGRIA';
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs';
  modal.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-200 text-xs space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <i data-lucide="${isSangria ? 'arrow-up-right' : 'arrow-down-left'}" class="w-4 h-4 ${isSangria ? 'text-amber-400' : 'text-emerald-400'}"></i>
          Lançar ${isSangria ? 'Sangria (Retirada)' : 'Suprimento (Aporte)'}
        </h3>
        <button id="btnCancelMovement" class="p-1 text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <form id="formMovement" class="space-y-4">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Valor (${currency}) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            id="movementAmount"
            required
            placeholder="0.00"
            class="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:border-orange-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Justificativa / Motivo *</label>
          <input
            type="text"
            id="movementReason"
            required
            placeholder="${isSangria ? 'Ex: Sangria periódica para cofre da gerência' : 'Ex: Troco inicial complementar de moedas'}"
            class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-orange-500 focus:outline-hidden"
          />
        </div>

        <button type="submit" class="w-full py-2.5 rounded-xl ${isSangria ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-bold text-xs shadow-md transition">
          Registrar ${type}
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#btnCancelMovement')?.addEventListener('click', close);

  modal.querySelector('#formMovement')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(modal.querySelector('#movementAmount').value) || 0;
    const reason = modal.querySelector('#movementReason').value;
    const client = getSupabase();

    if (client && activeCashSession) {
      try {
        await client.from('cash_movements').insert({
          session_id: activeCashSession.id,
          store_id: storeId,
          movement_type: type,
          amount: amount,
          reason: reason,
          operator_name: user?.fullName || 'GEF'
        });

        // Atualizar totais na sessão
        const field = isSangria ? 'total_sangrias' : 'total_entries';
        const currentVal = Number(activeCashSession[field] || 0);
        await client.from('cash_sessions').update({
          [field]: currentVal + amount
        }).eq('id', activeCashSession.id);
      } catch (err) {
        console.error('Erro ao registrar movimento:', err);
      }
    }

    close();
    const container = document.getElementById('viewContainer');
    if (container) renderCashView(container);
  });
}

/**
 * Modal de Fechamento de Caixa com Conferência Cega
 */
function openCloseSessionModal(storeId, currency, user) {
  const initialCash = Number(activeCashSession?.initial_cash || 0);
  const salesCash = Number(activeCashSession?.total_sales_cash || 0);
  const totalSangrias = Number(activeCashSession?.total_sangrias || 0);
  const totalSuprimentos = Number(activeCashSession?.total_entries || 0);
  const expectedCash = initialCash + salesCash + totalSuprimentos - totalSangrias;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs';
  modal.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-200 text-xs space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <i data-lucide="lock" class="w-4 h-4 text-rose-400"></i>
          Fechamento de Caixa e Turno
        </h3>
        <button id="btnCancelCloseSession" class="p-1 text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] space-y-1">
        <div class="flex justify-between text-slate-400">
          <span>Saldo Inicial (Fundo):</span>
          <span class="font-mono text-white">${initialCash.toFixed(2)} ${currency}</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Entradas PDV (Dinheiro):</span>
          <span class="font-mono text-emerald-400">+${salesCash.toFixed(2)} ${currency}</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Sangrias (Retiradas):</span>
          <span class="font-mono text-amber-400">-${totalSangrias.toFixed(2)} ${currency}</span>
        </div>
        <div class="border-t border-slate-700 pt-1 flex justify-between font-bold text-white">
          <span>Saldo Esperado em Caixa:</span>
          <span class="font-mono text-orange-400">${expectedCash.toFixed(2)} ${currency}</span>
        </div>
      </div>

      <form id="formCloseSession" class="space-y-4">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Valor Contado em Gaveta (${currency}) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            id="countedCashInput"
            required
            placeholder="0.00"
            class="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-base font-bold focus:border-orange-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Observações do Turno</label>
          <textarea
            id="sessionNotes"
            rows="2"
            placeholder="Justificativa de quebra/sobra ou ocorrências no expediente..."
            class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-orange-500 focus:outline-hidden"
          ></textarea>
        </div>

        <button type="submit" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 text-white font-bold text-xs shadow-md transition">
          Confirmar e Encerrar Turno
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#btnCancelCloseSession')?.addEventListener('click', close);

  modal.querySelector('#formCloseSession')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const counted = Number(modal.querySelector('#countedCashInput').value) || 0;
    const notes = modal.querySelector('#sessionNotes').value;
    const diff = counted - expectedCash;
    const client = getSupabase();

    if (client && activeCashSession) {
      try {
        await client.from('cash_sessions').update({
          closed_at: new Date().toISOString(),
          counted_cash: counted,
          expected_cash: expectedCash,
          cash_difference: diff,
          notes: notes,
          status: 'CLOSED'
        }).eq('id', activeCashSession.id);
      } catch (err) {
        console.error('Erro ao fechar turno:', err);
      }
    }

    close();
    const container = document.getElementById('viewContainer');
    if (container) renderCashView(container);
  });
}

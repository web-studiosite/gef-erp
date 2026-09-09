/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Gestão da Equipe da Loja (js/users.js)
 * Requisito 12: O ADMIN pode cadastrar, listar e ativar/desativar os operadores da própria loja
 * Roles permitidas: GERENTE, CASHIER, ESTOQUISTA
 * O store_id é estritamente travado no contexto da loja do ADMIN
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId } from './supabase.js';
import { getCurrentUser, registerStoreOperator } from './auth.js';

let operatorsCache = [];

/**
 * Consulta os operadores da loja atual no Supabase
 */
export async function fetchStoreOperators() {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client || !user) return [];

  const storeId = user.storeId || getCurrentStoreId();
  if (!storeId || storeId === 'ALL') return [];

  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('default_store_id', storeId)
      .order('full_name', { ascending: true });

    if (error) {
      console.error('Erro ao buscar operadores da loja:', error);
      return [];
    }

    operatorsCache = data || [];
    return operatorsCache;
  } catch (err) {
    console.error('Falha de rede ao buscar operadores:', err);
    return [];
  }
}

/**
 * Ativa ou desativa um operador da própria loja
 */
export async function toggleOperatorStatus(operatorId, currentStatus) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = user.storeId || getCurrentStoreId();
  const newStatus = !currentStatus;

  const { error } = await client
    .from('profiles')
    .update({ active: newStatus })
    .eq('id', operatorId)
    .eq('default_store_id', storeId);

  if (error) throw new Error(formatErrorMessage(error));

  await client.from('audit_logs').insert({
    store_id: storeId,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: newStatus ? 'ATIVACAO_OPERADOR' : 'DESATIVACAO_OPERADOR',
    entity: 'profiles',
    record_id: operatorId,
    details: { operador_id: operatorId, novo_status: newStatus }
  });

  return true;
}

/**
 * Renderiza a view da Equipe da Loja
 */
export async function renderUsersView(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="space-y-5">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="user-check" class="w-5 h-5 text-orange-400"></i>
            Equipe da Loja & Controle de Operadores
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Cadastre gerentes, caixas e estoquistas vinculados automaticamente à sua filial.
          </p>
        </div>
        <button id="btnNewOperator" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-950/40 transition active:scale-95">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>Cadastrar Novo Operador</span>
        </button>
      </div>

      <!-- Tabela de Membros -->
      <div class="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-700">
              <tr>
                <th class="py-3 px-4">Nome Completo</th>
                <th class="py-3 px-4">E-mail de Acesso</th>
                <th class="py-3 px-4">Função / Perfil (RBAC)</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody id="operatorsTableBody" class="divide-y divide-slate-800/80">
              <tr>
                <td colspan="5" class="py-12 text-center text-slate-500">
                  <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
                  Carregando equipe da loja...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const tableBody = container.querySelector('#operatorsTableBody');
  const newOperatorBtn = container.querySelector('#btnNewOperator');

  const reload = async () => {
    const list = await fetchStoreOperators();
    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-12 text-center text-slate-500">
            Nenhum outro operador cadastrado para esta loja. Use o botão acima para adicionar membros.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = list.map(op => {
      const isSelf = op.id === user?.id;
      const roleBadges = {
        ADMIN: 'bg-blue-950 text-blue-300 border-blue-500/40',
        GERENTE: 'bg-amber-950 text-amber-300 border-amber-500/40',
        CASHIER: 'bg-emerald-950 text-emerald-300 border-emerald-500/40',
        ESTOQUISTA: 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
      };
      const badgeClass = roleBadges[op.role] || 'bg-slate-800 text-slate-300';

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-3.5 px-4 font-bold text-white flex items-center gap-2">
            <span>${op.full_name}</span>
            ${isSelf ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-orange-400 font-mono">Você</span>' : ''}
          </td>
          <td class="py-3.5 px-4 font-mono text-slate-300">
            ${op.email}
          </td>
          <td class="py-3.5 px-4">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}">
              ${op.role}
            </span>
          </td>
          <td class="py-3.5 px-4 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${op.active !== false ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">
              ${op.active !== false ? 'ATIVO' : 'INATIVO'}
            </span>
          </td>
          <td class="py-3.5 px-4 text-center">
            ${!isSelf ? `
              <button class="btn-toggle-op px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                op.active !== false
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-red-400 hover:border-red-500/40'
                  : 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900'
              }" data-id="${op.id}" data-active="${op.active !== false}">
                ${op.active !== false ? 'Desativar' : 'Reativar'}
              </button>
            ` : '<span class="text-slate-600">-</span>'}
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    tableBody.querySelectorAll('.btn-toggle-op').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const active = btn.dataset.active === 'true';
        try {
          await toggleOperatorStatus(id, active);
          await reload();
        } catch (err) {
          alert('Falha ao alterar status do operador: ' + err.message);
        }
      });
    });
  };

  newOperatorBtn.addEventListener('click', () => openNewOperatorModal(reload));

  await reload();
}

function openNewOperatorModal(onSuccess) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 class="font-bold text-base text-white">Cadastrar Membro da Equipe</h3>
        <button id="closeOpModalBtn" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>

      <p class="text-[11px] text-slate-400">
        O operador será automaticamente associado à sua filial ativa com as permissões da função selecionada.
      </p>

      <form id="opForm" class="space-y-3">
        <div id="opError" class="hidden p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs"></div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Nome Completo *</label>
          <input type="text" id="opFullName" required placeholder="Ex: Lucas Machava" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">E-mail de Login *</label>
          <input type="email" id="opEmail" required placeholder="lucas@suaempresa.co.mz" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Senha Inicial de Acesso *</label>
          <input type="password" id="opPassword" required minlength="6" placeholder="Mínimo 6 caracteres" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs" />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Função / Perfil de Acesso *</label>
          <select id="opRole" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold">
            <option value="CASHIER">CASHIER (Operador de Balcão e Caixa)</option>
            <option value="GERENTE">GERENTE (Gestão Operacional da Loja)</option>
            <option value="ESTOQUISTA">ESTOQUISTA (Armazém, Pátio e Estoque)</option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button type="button" id="cancelOpBtn" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">Cancelar</button>
          <button type="submit" id="saveOpBtn" class="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold">Cadastrar Operador</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#closeOpModalBtn').addEventListener('click', close);
  modal.querySelector('#cancelOpBtn').addEventListener('click', close);

  modal.querySelector('#opForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = modal.querySelector('#opError');
    const saveBtn = modal.querySelector('#saveOpBtn');

    errorBox.classList.add('hidden');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Criando operador...';

    const res = await registerStoreOperator({
      fullName: modal.querySelector('#opFullName').value,
      email: modal.querySelector('#opEmail').value,
      password: modal.querySelector('#opPassword').value,
      role: modal.querySelector('#opRole').value
    });

    if (res.success) {
      close();
      onSuccess();
    } else {
      errorBox.textContent = res.error || 'Falha ao cadastrar operador.';
      errorBox.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Cadastrar Operador';
    }
  });
}

/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo da Área do Embaixador (js/ambassador.js)
 * Requisito 8: Interface funcional para o perfil EMBAIXADOR
 * Link de indicação, lojas referenciadas, comissões reais do Supabase, sem dados fictícios
 */

import { getSupabase, formatErrorMessage } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Consulta referências e comissões do embaixador no Supabase
 */
export async function fetchAmbassadorData(ambassadorId) {
  const client = getSupabase();
  if (!client) return { referrals: [], payouts: [], code: 'EMB-' + ambassadorId?.substring(0, 6) };

  try {
    // 1. Obter código de referência do perfil
    const { data: profile } = await client
      .from('profiles')
      .select('referral_code, full_name, email')
      .eq('id', ambassadorId)
      .single();

    const referralCode = profile?.referral_code || 'GEF-' + ambassadorId?.substring(0, 6).toUpperCase();

    // 2. Lojas indicadas por este embaixador
    const { data: stores, error: storesErr } = await client
      .from('stores')
      .select('*')
      .eq('referred_by', ambassadorId);

    // 3. Comissões registradas
    const { data: payouts } = await client
      .from('ambassador_payouts')
      .select('*')
      .eq('ambassador_id', ambassadorId)
      .order('created_at', { ascending: false });

    return {
      referralCode,
      ambassadorName: profile?.full_name,
      referrals: stores || [],
      payouts: payouts || []
    };
  } catch (err) {
    console.error('Erro ao buscar dados do embaixador:', err);
    return { referrals: [], payouts: [], code: 'GEF-EMB' };
  }
}

/**
 * Renderiza a visualização do Embaixador
 */
export async function renderAmbassadorView(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="space-y-6 text-xs text-slate-200">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="award" class="w-5 h-5 text-orange-400"></i>
            Painel do Embaixador & Programa de Parceiros
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Acompanhe o crescimento das suas lojas parceiras indicadas e as comissões apuradas.
          </p>
        </div>
        <button id="btnRefreshAmbassador" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
          <span>Atualizar Dados</span>
        </button>
      </div>

      <!-- Card do Link de Indicação -->
      <div class="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-orange-950/40 border border-slate-800 space-y-3 shadow-lg">
        <div class="flex items-center gap-2 text-white font-bold text-sm">
          <i data-lucide="share-2" class="w-4 h-4 text-orange-400"></i>
          <span>Seu Link Oficial de Indicação de Lojas</span>
        </div>
        <p class="text-xs text-slate-400">
          Compartilhe este link com novos donos de depósitos e materiais de construção para vincular a comissão à sua conta:
        </p>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            id="ambassadorLinkInput"
            readonly
            value=""
            class="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-orange-400 font-mono text-xs select-all focus:outline-hidden"
          />
          <button
            id="btnCopyAmbassadorLink"
            class="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-950/40 flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <i data-lucide="copy" class="w-4 h-4"></i>
            <span id="copyBtnText">Copiar Link</span>
          </button>
        </div>
      </div>

      <!-- Métricas de Comissão -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Lojas Indicadas</span>
          <span id="ambReferralsCount" class="text-2xl font-extrabold font-mono text-white mt-1 block">0</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Comissão Acumulada</span>
          <span id="ambCommissionAcc" class="text-2xl font-extrabold font-mono text-emerald-400 mt-1 block">0.00 MT</span>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Comissão a Receber</span>
          <span id="ambCommissionPending" class="text-2xl font-extrabold font-mono text-amber-400 mt-1 block">0.00 MT</span>
        </div>
      </div>

      <!-- Tabela de Lojas Indicadas -->
      <div class="space-y-3">
        <h3 class="font-bold text-sm text-white flex items-center gap-2">
          <i data-lucide="store" class="w-4 h-4 text-orange-400"></i>
          <span>Lojas Indicadas por Você</span>
        </h3>
        <div class="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-700">
                <tr>
                  <th class="py-3 px-4">Nome da Loja</th>
                  <th class="py-3 px-4">Plano</th>
                  <th class="py-3 px-4">Data de Cadastro</th>
                  <th class="py-3 px-4 text-center">Status</th>
                  <th class="py-3 px-4 text-right">Comissão Gerada</th>
                </tr>
              </thead>
              <tbody id="ambStoresTableBody" class="divide-y divide-slate-800/80">
                <tr>
                  <td colspan="5" class="py-12 text-center text-slate-500">
                    <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
                    Buscando suas indicações...
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

  const linkInput = container.querySelector('#ambassadorLinkInput');
  const copyBtn = container.querySelector('#btnCopyAmbassadorLink');
  const copyBtnText = container.querySelector('#copyBtnText');
  const referralsCount = container.querySelector('#ambReferralsCount');
  const commissionAcc = container.querySelector('#ambCommissionAcc');
  const commissionPending = container.querySelector('#ambCommissionPending');
  const tableBody = container.querySelector('#ambStoresTableBody');
  const refreshBtn = container.querySelector('#btnRefreshAmbassador');

  const load = async () => {
    const data = await fetchAmbassadorData(user?.id);

    const baseUrl = window.location.origin + window.location.pathname;
    const refUrl = `${baseUrl}#/register-store?ref=${data.referralCode || 'EMB'}`;
    linkInput.value = refUrl;

    referralsCount.textContent = data.referrals.length;

    // Calcular comissões
    const totalAcc = data.payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    commissionAcc.textContent = `${totalAcc.toFixed(2)} MT`;

    // Requisito 8: Se não houver dados no banco, exibir estado vazio claro: "Nenhuma indicação registrada até o momento."
    if (data.referrals.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-12 text-center text-slate-500">
            Nenhuma indicação registrada até o momento.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = data.referrals.map(st => {
      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-3 px-4 font-bold text-white">${st.name}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-orange-400 border border-slate-700">
              ${st.plan_id || 'FREE'}
            </span>
          </td>
          <td class="py-3 px-4 text-slate-400 font-mono">
            ${st.created_at ? new Date(st.created_at).toLocaleDateString('pt-PT') : '-'}
          </td>
          <td class="py-3 px-4 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${st.active !== false ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">
              ${st.active !== false ? 'ATIVA' : 'INATIVA'}
            </span>
          </td>
          <td class="py-3 px-4 text-right font-mono font-bold text-emerald-400">
            ${Number(st.ambassador_commission || 0).toFixed(2)} MT
          </td>
        </tr>
      `;
    }).join('');
  };

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyBtnText.textContent = 'Copiado!';
      setTimeout(() => (copyBtnText.textContent = 'Copiar Link'), 2500);
    } catch (e) {
      linkInput.select();
      document.execCommand('copy');
      copyBtnText.textContent = 'Copiado!';
      setTimeout(() => (copyBtnText.textContent = 'Copiar Link'), 2500);
    }
  });

  refreshBtn.addEventListener('click', load);

  await load();
}

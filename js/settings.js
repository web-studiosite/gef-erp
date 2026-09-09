/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Configuração da Loja (js/settings.js)
 * Requisito 19: Edição e persistência real no Supabase de todos os dados comerciais
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId, getCredentials, saveCredentials, testConnection } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Consulta as configurações da loja ativa no Supabase
 */
export async function fetchStoreConfig() {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) return null;

  const storeId = user?.storeId || getCurrentStoreId();
  if (!storeId || storeId === 'ALL') return null;

  try {
    const { data, error } = await client
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar configurações da loja:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Erro de conexão:', err);
    return null;
  }
}

/**
 * Salva as alterações da loja no Supabase (Requisito 19)
 */
export async function saveStoreConfig(storeData) {
  const client = getSupabase();
  const user = getCurrentUser();
  if (!client) throw new Error('Supabase não conectado.');

  const storeId = user?.storeId || getCurrentStoreId();
  if (!storeId || storeId === 'ALL') {
    throw new Error('Selecione uma loja específica para salvar as configurações.');
  }

  const payload = {
    name: storeData.name?.trim(),
    trade_name: storeData.trade_name?.trim() || storeData.name?.trim(),
    code: storeData.code?.trim(),
    cnpj_nif: storeData.cnpj_nif?.trim() || null,
    phone: storeData.phone?.trim() || null,
    email: storeData.email?.trim() || null,
    address: storeData.address?.trim() || null,
    city: storeData.city?.trim() || 'Maputo',
    state: storeData.state?.trim() || 'Maputo Cidade',
    currency: storeData.currency?.trim() || 'MT',
    receipt_header: storeData.receipt_header?.trim() || null,
    receipt_footer: storeData.receipt_footer?.trim() || null,
    logo_url: storeData.logo_url?.trim() || null
  };

  const { data, error } = await client
    .from('stores')
    .update(payload)
    .eq('id', storeId)
    .select()
    .single();

  if (error) throw new Error(formatErrorMessage(error));

  // Registrar auditoria
  await client.from('audit_logs').insert({
    store_id: storeId,
    user_id: user?.id || null,
    operator_name: user?.fullName || 'GEF',
    action: 'ATUALIZACAO_CONFIG_LOJA',
    entity: 'stores',
    record_id: storeId,
    details: {
      nome_loja: data.name,
      nuit: data.cnpj_nif,
      moeda: data.currency
    }
  });

  return data;
}

/**
 * Renderiza a view de Configurações da Loja
 */
export async function renderSettingsView(container) {
  container.innerHTML = `
    <div class="space-y-6 max-w-5xl mx-auto text-xs text-slate-200">
      <!-- Header -->
      <div class="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
        <div>
          <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
            <i data-lucide="settings" class="w-5 h-5 text-orange-400"></i>
            Configurações Comerciais & Domínio da Loja
          </h1>
          <p class="text-xs text-slate-400 mt-1">
            Requisito 19: Edição completa dos dados da sua empresa refletidos dinamicamente nos recibos e faturas.
          </p>
        </div>
        <div id="saveFeedback" class="hidden text-xs text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-500/40 px-3 py-1.5 rounded-xl">
          Dados atualizados no PostgreSQL!
        </div>
      </div>

      <!-- Formulário de Dados Comerciais -->
      <form id="settingsForm" class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div class="flex items-center gap-2 border-b border-slate-800 pb-3">
            <i data-lucide="building-2" class="w-4 h-4 text-orange-400"></i>
            <h3 class="text-sm font-bold text-white">Identificação & Dados Fiscais da Empresa</h3>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Nome Oficial da Empresa / Razão Social *</label>
              <input type="text" id="cfgStoreName" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Nome Fantasia / Marca Comercial</label>
              <input type="text" id="cfgTradeName" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Código da Loja</label>
              <input type="text" id="cfgStoreCode" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">NUIT / NIF / Documento Fiscal</label>
              <input type="text" id="cfgNuit" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Telefone Principal do Balcão</label>
              <input type="text" id="cfgPhone" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">E-mail Comercial</label>
              <input type="email" id="cfgEmail" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Cidade</label>
              <input type="text" id="cfgCity" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Moeda Principal de Faturamento *</label>
              <input type="text" id="cfgCurrency" value="MT" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-bold" />
            </div>
            <div class="sm:col-span-2">
              <label class="block font-semibold text-slate-300 mb-1">Endereço Completo & Armazéns</label>
              <input type="text" id="cfgAddress" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" />
            </div>
          </div>
        </div>

        <!-- Parâmetros do Recibo Térmico (Requisito 20) -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div class="flex items-center gap-2 border-b border-slate-800 pb-3">
            <i data-lucide="printer" class="w-4 h-4 text-orange-400"></i>
            <h3 class="text-sm font-bold text-white">Configuração do Recibo de Venda da Loja</h3>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Mensagem de Rodapé do Recibo</label>
              <textarea id="cfgReceiptFooter" rows="2" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white" placeholder="Ex: Favor conferir todos os materiais no ato de entrega. Obrigado pela preferência!"></textarea>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button type="submit" id="btnSaveConfig" class="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold shadow-lg shadow-orange-950/40 transition active:scale-95 flex items-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i>
            <span>Salvar Configurações no Banco</span>
          </button>
        </div>
      </form>

      <!-- Conexão Supabase / Credenciais Públicas (Requisito 25) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <div class="flex items-center gap-2 border-b border-slate-800 pb-3">
          <i data-lucide="database" class="w-4 h-4 text-emerald-400"></i>
          <div>
            <h3 class="text-sm font-bold text-white">Conexão Supabase / PostgreSQL (Fonte de Verdade)</h3>
            <p class="text-[11px] text-slate-400">Credenciais públicas da sua instância (Requisito 25: Chave anônima pública apenas).</p>
          </div>
        </div>

        <form id="supabaseCredsForm" class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Project URL do Supabase</label>
              <input type="url" id="sbUrl" placeholder="https://seu-projeto.supabase.co" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs" />
            </div>
            <div>
              <label class="block font-semibold text-slate-300 mb-1">Anon Public Key</label>
              <input type="password" id="sbAnonKey" placeholder="eyJhbGciOiJIUzI1NiIsIn..." class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs" />
            </div>
          </div>
          <div class="flex items-center justify-between pt-2">
            <button type="button" id="btnTestConn" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5">
              <i data-lucide="wifi" class="w-3.5 h-3.5 text-emerald-400"></i>
              <span>Testar Conexão com PostgreSQL</span>
            </button>
            <button type="submit" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
              Salvar Credenciais
            </button>
          </div>
          <div id="connTestResult" class="hidden p-3 rounded-xl border text-xs"></div>
        </form>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const settingsForm = container.querySelector('#settingsForm');
  const saveFeedback = container.querySelector('#saveFeedback');
  const sbUrlInput = container.querySelector('#sbUrl');
  const sbAnonKeyInput = container.querySelector('#sbAnonKey');
  const supabaseCredsForm = container.querySelector('#supabaseCredsForm');
  const btnTestConn = container.querySelector('#btnTestConn');
  const connTestResult = container.querySelector('#connTestResult');

  // Preencher credenciais atuais
  const creds = getCredentials();
  sbUrlInput.value = creds.url;
  sbAnonKeyInput.value = creds.key;

  // Carregar dados da loja do Supabase
  const storeData = await fetchStoreConfig();
  if (storeData) {
    container.querySelector('#cfgStoreName').value = storeData.name || '';
    container.querySelector('#cfgTradeName').value = storeData.trade_name || storeData.name || '';
    container.querySelector('#cfgStoreCode').value = storeData.code || '';
    container.querySelector('#cfgNuit').value = storeData.cnpj_nif || '';
    container.querySelector('#cfgPhone').value = storeData.phone || '';
    container.querySelector('#cfgEmail').value = storeData.email || '';
    container.querySelector('#cfgCity').value = storeData.city || 'Maputo';
    container.querySelector('#cfgAddress').value = storeData.address || '';
    container.querySelector('#cfgCurrency').value = storeData.currency || 'MT';
    container.querySelector('#cfgReceiptFooter').value = storeData.receipt_footer || '';
  }

  // Salvar dados comerciais
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await saveStoreConfig({
        name: container.querySelector('#cfgStoreName').value,
        trade_name: container.querySelector('#cfgTradeName').value,
        code: container.querySelector('#cfgStoreCode').value,
        cnpj_nif: container.querySelector('#cfgNuit').value,
        phone: container.querySelector('#cfgPhone').value,
        email: container.querySelector('#cfgEmail').value,
        city: container.querySelector('#cfgCity').value,
        address: container.querySelector('#cfgAddress').value,
        currency: container.querySelector('#cfgCurrency').value,
        receipt_footer: container.querySelector('#cfgReceiptFooter').value
      });

      saveFeedback.classList.remove('hidden');
      setTimeout(() => saveFeedback.classList.add('hidden'), 3500);
    } catch (err) {
      alert(err.message || 'Falha ao salvar configurações.');
    }
  });

  // Salvar credenciais Supabase
  supabaseCredsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveCredentials(sbUrlInput.value, sbAnonKeyInput.value);
    alert('Credenciais salvas com sucesso!');
    const res = await testConnection();
    connTestResult.className = `p-3 rounded-xl border text-xs ${res.connected ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-red-950/60 border-red-500/40 text-red-300'}`;
    connTestResult.textContent = res.message;
    connTestResult.classList.remove('hidden');
  });

  btnTestConn.addEventListener('click', async () => {
    connTestResult.textContent = 'Testando conexão com Supabase...';
    connTestResult.className = 'p-3 rounded-xl border text-xs bg-slate-800 border-slate-700 text-slate-300';
    connTestResult.classList.remove('hidden');
    const res = await testConnection();
    connTestResult.className = `p-3 rounded-xl border text-xs ${res.connected ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-red-950/60 border-red-500/40 text-red-300'}`;
    connTestResult.textContent = res.message;
  });
}

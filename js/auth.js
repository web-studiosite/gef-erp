/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Autenticação, Sessão, Perfis e RBAC (js/auth.js)
 * Controle de Acesso Baseado em Papéis com Supabase Auth e public.profiles
 */

import { getSupabase, formatErrorMessage, getCurrentStoreId, setCurrentStoreId } from './supabase.js';

export const SUPERADMIN_SPECIAL_UUID = 'aef2d4c5-b8dd-4d8a-8bff-7816ee687b53';
export const SUPERADMIN_SPECIAL_EMAIL = 'felisbertouele7@gmail.com';

const AUTH_USER_KEY = 'gef_auth_user_data';

let currentUser = null;
const authListeners = new Set();

/**
 * Normaliza a Role do utilizador e aplica a regra do SuperAdmin especial
 */
export function normalizeRole(role, userId, email) {
  if (
    userId === SUPERADMIN_SPECIAL_UUID || 
    (email && email.toLowerCase() === SUPERADMIN_SPECIAL_EMAIL.toLowerCase())
  ) {
    return 'SUPERADMIN';
  }

  const clean = (role || '').trim().toUpperCase();
  if (clean === 'SUPERADMIN') return 'SUPERADMIN';
  if (clean === 'ADMIN' || clean === 'ADMINISTRADOR') return 'ADMIN';
  if (clean === 'GERENTE') return 'GERENTE';
  if (clean === 'CASHIER' || clean === 'CAIXA' || clean === 'OPERADOR') return 'CASHIER';
  if (clean === 'ESTOQUISTA' || clean === 'ESTOQUE' || clean === 'ARMAZEM') return 'ESTOQUISTA';
  if (clean === 'EMBAIXADOR' || clean === 'PARCEIRO') return 'EMBAIXADOR';

  return 'CASHIER';
}

/**
 * Determina a área inicial (rota) autorizada conforme a Role (Requisitos 8 e 9)
 */
export function getDefaultRouteForRole(role) {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'SUPERADMIN':
      return 'monitor';
    case 'ADMIN':
      return 'dashboard';
    case 'GERENTE':
      return 'dashboard';
    case 'CASHIER':
      return 'pos';
    case 'ESTOQUISTA':
      return 'stock';
    case 'EMBAIXADOR':
      return 'ambassadors';
    default:
      return 'pos';
  }
}

/**
 * Lista de rotas autorizadas estritamente por Role (Requisito 7)
 */
export const ROLE_PERMISSIONS = {
  SUPERADMIN: ['monitor', 'stores', 'ambassadors', 'audit', 'reports', 'settings'],
  ADMIN: ['dashboard', 'pos', 'sales', 'products', 'stock', 'transfers', 'losses', 'customers', 'cash', 'users', 'reports', 'audit', 'settings'],
  GERENTE: ['dashboard', 'pos', 'sales', 'products', 'stock', 'transfers', 'losses', 'customers', 'cash', 'reports'],
  CASHIER: ['pos', 'sales', 'cash', 'customers'],
  ESTOQUISTA: ['stock', 'products', 'transfers', 'losses'],
  EMBAIXADOR: ['ambassadors']
};

/**
 * Verifica se a rota solicitada é permitida para o papel atual (Requisito 10)
 */
export function isRouteAllowed(route, role) {
  if (!route) return false;
  const norm = normalizeRole(role);
  const allowed = ROLE_PERMISSIONS[norm] || [];
  return allowed.includes(route.toLowerCase());
}

/**
 * Alias de verificação de rota com parâmetros invertidos ou compatíveis
 */
export function isRouteAuthorized(role, route) {
  return isRouteAllowed(route, role);
}

/**
 * Notifica os ouvintes da alteração de estado da autenticação
 */
function notifyListeners() {
  authListeners.forEach(listener => {
    try {
      listener(currentUser);
    } catch (e) {
      console.error('Erro no listener de autenticação:', e);
    }
  });
}

/**
 * Inscreve um listener para receber mudanças de usuário
 */
export function onAuthStateChanged(listener) {
  authListeners.add(listener);
  listener(currentUser);
  return () => authListeners.delete(listener);
}

/**
 * Obtém o utilizador atualmente autenticado em memória
 */
export function getCurrentUser() {
  if (!currentUser) {
    try {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      if (saved) {
        currentUser = JSON.parse(saved);
      }
    } catch {
      currentUser = null;
    }
  }
  return currentUser;
}

/**
 * Sincroniza a sessão do Supabase Auth com a tabela public.profiles
 */
export async function syncSession() {
  const client = getSupabase();
  if (!client) {
    currentUser = null;
    localStorage.removeItem(AUTH_USER_KEY);
    notifyListeners();
    return null;
  }

  try {
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session?.user) {
      currentUser = null;
      localStorage.removeItem(AUTH_USER_KEY);
      notifyListeners();
      return null;
    }

    const authUser = session.user;
    let role = 'CASHIER';
    let fullName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Operador';
    let storeId = authUser.user_metadata?.default_store_id || null;
    let storeData = null;

    // Regra Superadmin
    if (
      authUser.id === SUPERADMIN_SPECIAL_UUID || 
      (authUser.email && authUser.email.toLowerCase() === SUPERADMIN_SPECIAL_EMAIL.toLowerCase())
    ) {
      role = 'SUPERADMIN';
      storeId = 'ALL';
    } else {
      // Obter perfil na tabela public.profiles
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*, stores(*)')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile) {
        fullName = profile.full_name || fullName;
        role = normalizeRole(profile.role, authUser.id, authUser.email);
        storeId = profile.default_store_id || storeId;
        storeData = profile.stores;
      } else {
        // Se ainda não tiver perfil criado, criar perfil inicial
        role = normalizeRole(authUser.user_metadata?.role || 'ADMIN', authUser.id, authUser.email);
        storeId = authUser.user_metadata?.default_store_id || null;
        try {
          await client.from('profiles').insert({
            id: authUser.id,
            full_name: fullName,
            email: authUser.email,
            role: role,
            default_store_id: storeId,
            active: true
          });
        } catch (e) {
          console.warn('Tentativa de criação de perfil:', e);
        }
      }
    }

    // Se temos storeId e não for ALL, atualizar contexto da loja
    if (storeId && storeId !== 'ALL') {
      setCurrentStoreId(storeId);
      if (!storeData) {
        const { data: st } = await client.from('stores').select('*').eq('id', storeId).maybeSingle();
        if (st) storeData = st;
      }
    } else if (role === 'SUPERADMIN') {
      // SuperAdmin tem contexto global
      if (!getCurrentStoreId()) {
        const { data: firstStore } = await client.from('stores').select('*').limit(1).maybeSingle();
        if (firstStore) setCurrentStoreId(firstStore.id);
      }
    }

    currentUser = {
      id: authUser.id,
      email: authUser.email,
      fullName,
      role,
      storeId: storeId || getCurrentStoreId(),
      store: storeData,
      active: true
    };

    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
    notifyListeners();
    return currentUser;
  } catch (err) {
    console.error('Falha ao sincronizar sessão:', err);
    currentUser = null;
    notifyListeners();
    return null;
  }
}

/**
 * Sincroniza a sessão protegida por limite de tempo para nunca travar a renderização inicial
 */
export async function syncSessionWithTimeout(timeoutMs = 2500) {
  return Promise.race([
    syncSession(),
    new Promise((resolve) => setTimeout(() => {
      console.warn(`[GEF Auth] Tempo limite de sincronização (${timeoutMs}ms) atingido. Prosseguindo com estado em cache.`);
      resolve(getCurrentUser());
    }, timeoutMs))
  ]);
}

/**
 * Autenticação real com Supabase Auth (Sign In)
 */
export async function signIn(email, password) {
  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      error: 'Supabase não configurado. Por favor, conecte o Project URL e Anon Key primeiro.'
    };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      return {
        success: false,
        error: formatErrorMessage(error)
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'Credenciais inválidas. Verifique seu e-mail e senha.'
      };
    }

    const user = await syncSession();
    return {
      success: true,
      user,
      initialRoute: getDefaultRouteForRole(user?.role)
    };
  } catch (err) {
    return {
      success: false,
      error: formatErrorMessage(err)
    };
  }
}

/**
 * Cadastro de Loja com Primeiro Operador (Requisito 11)
 * O primeiro operador recebe automaticamente a role ADMIN
 */
export async function registerStoreAndAdmin(storeInput, adminInput = {}) {
  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      error: 'Supabase não conectado. Configure as credenciais no rodapé.'
    };
  }

  // Permite passar tanto { storeName, adminFullName... } quanto (storeData, adminData)
  const storeName = storeInput.storeName || storeInput.name || '';
  const storeCode = storeInput.storeCode || storeInput.code || '';
  const cnpjNif = storeInput.cnpjNif || storeInput.cnpj_nif || null;
  const phone = storeInput.phone || null;
  const city = storeInput.city || 'Maputo';
  const address = storeInput.address || null;
  const plan = storeInput.plan || 'FREE';
  const referralCode = storeInput.referralCode || null;

  const adminFullName = storeInput.adminFullName || adminInput.fullName || '';
  const adminEmail = storeInput.adminEmail || adminInput.email || '';
  const adminPassword = storeInput.adminPassword || adminInput.password || '';

  try {
    // 1. Criar a Loja em public.stores
    const code = (storeCode || 'GEF-' + Math.floor(1000 + Math.random() * 9000)).trim().toUpperCase();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const { data: store, error: storeError } = await client
      .from('stores')
      .insert({
        name: storeName.trim(),
        trade_name: (storeInput.tradeName || storeName).trim(),
        code: code,
        cnpj_nif: cnpjNif?.trim() || null,
        phone: phone?.trim() || null,
        city: city?.trim() || 'Maputo',
        address: address?.trim() || null,
        plan_id: plan,
        active: true,
        acesso_ativo: true,
        data_fim_teste: trialEnd.toISOString(),
        dias_teste_padrao: 14,
        mensalidade: 2500.00
      })
      .select()
      .single();

    if (storeError) {
      return {
        success: false,
        error: formatErrorMessage(storeError)
      };
    }

    // 2. Criar a conta de autenticação do primeiro operador (Supabase Auth)
    const { data: authData, error: authError } = await client.auth.signUp({
      email: adminEmail.trim(),
      password: adminPassword,
      options: {
        data: {
          full_name: adminFullName.trim(),
          role: 'ADMIN',
          default_store_id: store.id
        }
      }
    });

    if (authError) {
      return {
        success: false,
        error: formatErrorMessage(authError)
      };
    }

    // 3. Garantir o perfil com role ADMIN na tabela public.profiles
    if (authData.user) {
      await client.from('profiles').upsert({
        id: authData.user.id,
        full_name: adminFullName.trim(),
        email: adminEmail.trim(),
        phone: phone?.trim() || null,
        role: 'ADMIN',
        default_store_id: store.id,
        active: true
      });
    }

    // Registrar log de auditoria
    await client.from('audit_logs').insert({
      store_id: store.id,
      operator_name: adminFullName.trim(),
      action: 'CRIACAO_LOJA_REAL',
      entity: 'stores',
      record_id: store.id,
      details: {
        nome: store.name,
        codigo: store.code,
        primeiro_operador: adminFullName.trim(),
        role_atribuida: 'ADMIN'
      }
    });

    // Definir loja atual e sincronizar sessão
    setCurrentStoreId(store.id);
    const user = await syncSession();

    return {
      success: true,
      store,
      user,
      initialRoute: 'dashboard'
    };
  } catch (err) {
    return {
      success: false,
      error: formatErrorMessage(err)
    };
  }
}

/**
 * Cadastro de Outros Membros / Operadores pelo ADMIN da Loja (Requisito 12)
 * Permite as roles: GERENTE, CASHIER, ESTOQUISTA
 * O store_id é estritamente travado no contexto da loja do ADMIN logado
 */
export async function registerStoreOperator({ fullName, email, password, role }) {
  const client = getSupabase();
  const current = getCurrentUser();

  if (!client || !current) {
    return { success: false, error: 'Usuário não autenticado.' };
  }

  // Verificar se o usuário logado tem permissão para cadastrar operadores
  const adminRole = normalizeRole(current.role);
  if (adminRole !== 'ADMIN' && adminRole !== 'SUPERADMIN') {
    return { success: false, error: 'Apenas o Administrador da Loja pode cadastrar novos operadores.' };
  }

  const storeId = current.storeId;
  if (!storeId || storeId === 'ALL') {
    return { success: false, error: 'Selecione uma loja específica antes de cadastrar operadores.' };
  }

  // Validação da role permitida
  const targetRole = normalizeRole(role);
  if (!['GERENTE', 'CASHIER', 'ESTOQUISTA'].includes(targetRole) && adminRole !== 'SUPERADMIN') {
    return { success: false, error: 'Função inválida. Selecione Gerente, Caixa ou Estoquista.' };
  }

  try {
    const { data: authData, error: authError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: targetRole,
          default_store_id: storeId
        }
      }
    });

    if (authError) {
      return { success: false, error: formatErrorMessage(authError) };
    }

    if (authData.user) {
      await client.from('profiles').upsert({
        id: authData.user.id,
        full_name: fullName.trim(),
        email: email.trim(),
        role: targetRole,
        default_store_id: storeId,
        active: true
      });

      // Trilha de auditoria
      await client.from('audit_logs').insert({
        store_id: storeId,
        user_id: current.id,
        operator_name: current.fullName,
        action: 'CADASTRO_OPERADOR',
        entity: 'profiles',
        record_id: authData.user.id,
        details: {
          operador_cadastrado: fullName.trim(),
          email: email.trim(),
          funcao: targetRole,
          loja_id: storeId
        }
      });
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

/**
 * Encerramento de Sessão (Logout)
 */
export async function signOut() {
  const client = getSupabase();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      // safe fallback
    }
  }
  currentUser = null;
  localStorage.removeItem(AUTH_USER_KEY);
  notifyListeners();
}

export const loginWithPassword = signIn;
export const logoutUser = signOut;


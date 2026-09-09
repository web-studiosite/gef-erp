/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Emissão de Recibo Térmico (js/receipts.js)
 * Requisitos 18 e 20: Impressão térmica 80mm/58mm com cabeçalho da loja, operador,
 * itens com unidade/embalagem, descontos e Nome do Comprador gravado na venda.
 */

import { fetchStoreConfig } from './settings.js';
import { getGefLogoSvg } from './logo.js';

let activeReceiptModal = null;

/**
 * Abre o modal de visualização e impressão do Recibo Térmico Oficial
 */
export async function openReceiptModal(saleData) {
  // Obter configurações da loja no Supabase para montar o cabeçalho e rodapé oficial
  const store = await fetchStoreConfig();

  const storeName = store?.trade_name || store?.name || 'GEF MATERIAIS DE CONSTRUÇÃO';
  const storeNuit = store?.cnpj_nif ? `NUIT: ${store.cnpj_nif}` : 'NUIT: 400123987';
  const storePhone = store?.phone ? `Tel: ${store.phone}` : 'Tel: +258 84 000 0000';
  const storeAddress = store?.address ? `${store.address} - ${store?.city || 'Maputo'}` : 'Av. de Moçambique, Maputo';
  const storeFooter = store?.receipt_footer || 'Obrigado pela preferência! Guarde este recibo como comprovativo de compra.';
  const currency = store?.currency || 'MT';

  const modalContainer = document.createElement('div');
  modalContainer.id = 'thermalReceiptOverlay';
  modalContainer.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto';

  const dateFormatted = saleData.date ? new Date(saleData.date).toLocaleString('pt-PT') : new Date().toLocaleString('pt-PT');
  const customerName = (saleData.customerName || 'Consumidor Final').trim();

  modalContainer.innerHTML = `
    <div class="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col my-auto">
      <!-- Barra Superior com Controles de Impressão -->
      <div class="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div class="flex items-center gap-2 text-white font-bold text-xs">
          ${getGefLogoSvg('icon', { className: 'w-6 h-6 shrink-0' })}
          <span>GEF • Recibo Térmico (80mm/58mm)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button id="btnPrintReceiptNow" class="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
            <span>Imprimir</span>
          </button>
          <button id="btnCloseReceiptModal" class="p-1 rounded-lg text-slate-400 hover:text-white transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
      </div>

      <!-- Área Imprimível do Cupom Térmico (Estilo Papel Térmico) -->
      <div class="p-4 bg-slate-950/60 overflow-y-auto max-h-[75vh]">
        <div id="thermalReceiptContent" class="bg-white text-black p-5 rounded shadow font-mono text-[11px] leading-tight space-y-2 select-text">
          <!-- Cabeçalho da Empresa -->
          <div class="text-center pb-2 border-b border-dashed border-black space-y-0.5">
            <h2 class="text-sm font-black uppercase tracking-tight">${storeName}</h2>
            <div>${storeAddress}</div>
            <div>${storeNuit} | ${storePhone}</div>
            <div class="pt-1 text-[12px] font-black uppercase">COMPROVATIVO DE VENDA</div>
          </div>

          <!-- Metadados da Venda -->
          <div class="py-1 border-b border-dashed border-black space-y-0.5 text-[10px]">
            <div class="flex justify-between">
              <span>RECIBO Nº:</span>
              <strong class="font-bold">${saleData.saleNumber || 'VEN-000000'}</strong>
            </div>
            <div class="flex justify-between">
              <span>DATA/HORA:</span>
              <span>${dateFormatted}</span>
            </div>
            <div class="flex justify-between">
              <span>OPERADOR:</span>
              <span class="uppercase">${saleData.cashierName || 'GEF'}</span>
            </div>
            <!-- Requisito 18: Cliente no Recibo -->
            <div class="flex justify-between font-bold border-t border-dotted border-gray-400 pt-0.5 mt-0.5 text-[11px]">
              <span>CLIENTE:</span>
              <span class="text-right uppercase">${customerName}</span>
            </div>
          </div>

          <!-- Grade de Itens da Venda -->
          <div class="py-1 border-b border-dashed border-black space-y-1">
            <div class="flex justify-between text-[10px] font-bold border-b border-gray-300 pb-0.5">
              <span>DESCRIÇÃO</span>
              <span>TOTAL (${currency})</span>
            </div>
            <div class="space-y-1">
              ${(saleData.items || []).map(item => {
                const itemTotal = (item.quantity * item.unit_price).toFixed(2);
                return `
                  <div>
                    <div class="font-bold uppercase text-[10px]">${item.name}</div>
                    <div class="flex justify-between text-[10px] text-gray-700 pl-1">
                      <span>${item.quantity} ${item.packaging_name || 'un'} x ${Number(item.unit_price).toFixed(2)}</span>
                      <span class="font-bold text-black">${itemTotal}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Totais & Desconto -->
          <div class="py-1 border-b border-dashed border-black space-y-0.5 text-[11px]">
            <div class="flex justify-between">
              <span>SUBTOTAL:</span>
              <span>${Number(saleData.subtotal || saleData.total).toFixed(2)} ${currency}</span>
            </div>
            ${Number(saleData.discount) > 0 ? `
              <div class="flex justify-between font-bold">
                <span>DESCONTO:</span>
                <span>-${Number(saleData.discount).toFixed(2)} ${currency}</span>
              </div>
            ` : ''}
            <div class="flex justify-between text-xs font-black pt-1 border-t border-black">
              <span>TOTAL A PAGAR:</span>
              <span>${Number(saleData.total).toFixed(2)} ${currency}</span>
            </div>
          </div>

          <!-- Pagamento e Troco -->
          <div class="py-1 border-b border-dashed border-black space-y-0.5 text-[10px]">
            <div class="flex justify-between">
              <span>FORMA DE PAGAMENTO:</span>
              <span class="font-bold uppercase">${saleData.paymentMethod || 'DINHEIRO'}</span>
            </div>
            ${saleData.paymentMethod === 'DINHEIRO' && saleData.cashTendered ? `
              <div class="flex justify-between">
                <span>VALOR ENTREGUE:</span>
                <span>${Number(saleData.cashTendered).toFixed(2)} ${currency}</span>
              </div>
              <div class="flex justify-between font-bold">
                <span>TROCO:</span>
                <span>${Number(saleData.change || 0).toFixed(2)} ${currency}</span>
              </div>
            ` : ''}
          </div>

          <!-- Rodapé Oficial da Loja -->
          <div class="pt-2 text-center text-[9px] text-gray-700 leading-normal">
            <div>${storeFooter}</div>
            <div class="pt-1 text-[8px] text-gray-500 font-sans">Emitido pelo Sistema GEF Enterprise</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalContainer);
  activeReceiptModal = modalContainer;

  if (window.lucide) window.lucide.createIcons();

  const close = () => {
    if (activeReceiptModal) {
      activeReceiptModal.remove();
      activeReceiptModal = null;
    }
  };

  modalContainer.querySelector('#btnCloseReceiptModal').addEventListener('click', close);

  modalContainer.querySelector('#btnPrintReceiptNow').addEventListener('click', () => {
    // Abrir janela limpa para impressão térmica
    const printContent = modalContainer.querySelector('#thermalReceiptContent').innerHTML;
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo - ${saleData.saleNumber || 'VENDA'}</title>
          <meta charset="utf-8" />
          <style>
            @page { margin: 0; size: auto; }
            body {
              font-family: monospace;
              font-size: 11px;
              line-height: 1.25;
              color: #000;
              background: #fff;
              padding: 10px;
              width: 280px;
              margin: 0 auto;
            }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .font-black { font-weight: 900; }
            .uppercase { text-transform: uppercase; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .border-b { border-bottom: 1px dashed #000; }
            .border-t { border-top: 1px dashed #000; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .pb-2 { padding-bottom: 8px; }
            .pt-1 { padding-top: 4px; }
            .pt-2 { padding-top: 8px; }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  });
}

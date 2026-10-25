import QRCode from 'qrcode';

/**
 * Thermal Packing Slip Printer Utility
 * Formatted specifically for 80mm and 58mm POS thermal receipt & label printers.
 */

export interface ThermalPrintOptions {
  paperWidth?: '80mm' | '58mm';
  showPrices?: boolean;
  storeName?: string;
  storePhone?: string;
  includeCheckboxes?: boolean;
}

export function formatCurrency(amount: number): string {
  return `₹${(amount || 0).toFixed(2).replace(/\.00$/, '')}`;
}

export function generateSingleSlipHtml(order: any, options: ThermalPrintOptions = {}): string {
  const {
    paperWidth = '80mm',
    showPrices = true,
    storeName = 'FRESH N LOCAL CO.',
    storePhone = '+91 9106070032',
    includeCheckboxes = true,
  } = options;

  const orderNum = order.orderNumber || `#FNL-${(order.id || '').slice(0, 8).toUpperCase()}`;
  const isPickup = order.shippingDetails?.address?.includes('Store Pickup') || order.deliveryType === 'pickup';
  const isHoreca = order.isHoreca || order.customerType === 'horeca' || order.customerType === 'horeca_admin';
  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : new Date().toLocaleString('en-IN');

  // Robust parsing of order items handling both { product: {...}, quantity } and flattened { name, price, ... }
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const parsedItems = rawItems.map((it: any) => {
    const prod = it?.product || it || {};
    const qty = Number(it.quantity) || 1;
    
    // Resolve price: check item level override (e.g. HoReCa custom price) first, then product level
    let rawPrice = 0;
    if (it.price !== undefined && it.price !== null && it.price !== '') {
      rawPrice = it.price;
    } else if (prod.price !== undefined && prod.price !== null && prod.price !== '') {
      rawPrice = prod.price;
    }
    const price = Number(rawPrice) || 0;

    const name = prod.name || prod.title || it.name || it.title || 'Item';
    const itemCode = prod.itemCode || it.itemCode || it.product?.itemCode || '';
    const unit = prod.unit || prod.selectedUnit || it.unit || it.selectedUnit || '';
    const variantName = prod.variantName || it.variantName || prod.selectedVariant || it.selectedVariant || '';
    const total = qty * price;

    return {
      name,
      itemCode,
      qty,
      price,
      unit,
      variantName,
      total,
    };
  });

  const totalItemCount = parsedItems.length;
  const totalQtyCount = parsedItems.reduce((sum: number, it: any) => sum + it.qty, 0);

  const subtotal = parsedItems.reduce((sum: number, it: any) => sum + it.total, 0);
  const discount = Number(order.discount) || (order.pointsRedeemed ? 100 : 0);
  const deliveryFee = Number(order.deliveryFee) || 0;
  const finalTotal = (order.totalAmount !== undefined && order.totalAmount !== null && order.totalAmount !== '')
    ? Number(order.totalAmount)
    : Math.max(0, subtotal - discount + deliveryFee);

  const customerName = order.shippingDetails?.name || order.customerName || order.userName || 'Customer';
  const customerPhone = order.shippingDetails?.phone || order.phone || order.customerPhone || 'No phone';
  const customerAddress = isPickup 
    ? 'STORE PICKUP: Fresh N Local Co. Farm Store' 
    : (order.shippingDetails?.address || order.address || 'No address specified');

  return `
    <div class="thermal-slip ${paperWidth === '58mm' ? 'width-58' : 'width-80'}">
      <!-- Header -->
      <div class="center bold text-lg">${storeName}</div>
      <div class="center text-xs">Ph: ${storePhone}</div>
      <div class="divider-double"></div>

      <!-- Slip Title -->
      <div class="center bold text-md uppercase">*** PACKING SLIP ***</div>
      <div class="center text-xs bold uppercase ${isPickup ? 'highlight-box' : ''}">
        ${isPickup ? '🏪 STORE PICKUP ORDER' : (isHoreca ? '🏢 B2B / HORECA ORDER' : '🚚 HOME DELIVERY')}
      </div>
      <div class="divider-dashed"></div>

      <!-- Order Metadata -->
      <table class="meta-table text-xs">
        <tr>
          <td class="bold">Order #:</td>
          <td class="right bold">${orderNum}</td>
        </tr>
        <tr>
          <td>Date:</td>
          <td class="right">${orderDate}</td>
        </tr>
        <tr>
          <td>Status:</td>
          <td class="right bold uppercase">${(order.status || 'PENDING').toUpperCase()}</td>
        </tr>
        <tr>
          <td>Payment:</td>
          <td class="right bold uppercase">${order.paymentMethod || 'COD (Cash on Delivery)'}</td>
        </tr>
      </table>

      <div class="divider-dashed"></div>

      <!-- Customer / Delivery Info -->
      <div class="bold text-xs uppercase">Customer Details:</div>
      <div class="bold text-sm text-black">${customerName}</div>
      <div class="bold text-sm phone-number">📞 ${customerPhone}</div>
      
      <div class="bold text-xs uppercase" style="margin-top: 4px;">Delivery Address:</div>
      <div class="text-xs address-box">
        ${customerAddress}
        ${order.shippingDetails?.zone ? `<br/><b>Zone:</b> ${order.shippingDetails.zone}` : ''}
        ${order.shippingDetails?.pincode ? `<br/><b>PIN:</b> ${order.shippingDetails.pincode}` : ''}
      </div>

      ${order.notes || order.customerNote ? `
        <div class="divider-dashed"></div>
        <div class="bold text-xs">SPECIAL INSTRUCTIONS:</div>
        <div class="text-xs italic note-box">${order.notes || order.customerNote}</div>
      ` : ''}

      <div class="divider-double"></div>

      <!-- Item Checklist -->
      <div class="items-header text-xs bold">
        <span class="col-chk">✓</span>
        <span class="col-item">ITEM DESCRIPTION</span>
        <span class="col-qty right">QTY</span>
        ${showPrices ? '<span class="col-price right">AMT</span>' : ''}
      </div>
      <div class="divider-solid"></div>

      <div class="items-list">
        ${parsedItems.length > 0 ? parsedItems.map((it: any, index: number) => {
          return `
            <div class="item-row">
              <div class="item-top">
                ${includeCheckboxes ? '<span class="checkbox">[ ]</span>' : `<span class="item-num">${index + 1}.</span>`}
                <span class="item-name bold">${it.itemCode ? `[#${it.itemCode}] ` : ''}${it.name}</span>
                <span class="item-qty bold right">x${it.qty}</span>
                ${showPrices ? `<span class="item-amt right bold">${formatCurrency(it.total)}</span>` : ''}
              </div>
              <div class="item-sub text-xs">
                ${it.unit ? `<span class="unit-badge">${it.unit}</span>` : ''}
                ${showPrices ? `<span class="unit-rate">(@ ${formatCurrency(it.price)})</span>` : ''}
                ${it.variantName ? `<span class="variant-text">${it.variantName}</span>` : ''}
              </div>
            </div>
          `;
        }).join('') : `
          <div class="center italic text-xs" style="padding: 10px 0;">No items found in this order</div>
        `}
      </div>

      <div class="divider-solid"></div>

      <!-- Packing Totals Summary -->
      <div class="pack-summary bold text-xs">
        <div>TOTAL ITEMS: <span class="badge-count">${totalItemCount} SKU(s)</span></div>
        <div class="right">TOTAL UNITS: <span class="badge-count">${totalQtyCount} Pcs</span></div>
      </div>

      ${showPrices ? `
        <div class="divider-dashed"></div>
        <table class="totals-table text-xs">
          <tr>
            <td>Items Subtotal:</td>
            <td class="right">${formatCurrency(subtotal)}</td>
          </tr>
          ${discount > 0 ? `
            <tr>
              <td>Discount:</td>
              <td class="right">- ${formatCurrency(discount)}</td>
            </tr>
          ` : ''}
          <tr>
            <td>Delivery:</td>
            <td class="right">${deliveryFee === 0 ? 'FREE' : formatCurrency(deliveryFee)}</td>
          </tr>
          <tr class="total-row bold text-sm">
            <td>TOTAL AMOUNT:</td>
            <td class="right bold">${formatCurrency(finalTotal)}</td>
          </tr>
        </table>
      ` : ''}

      <div class="divider-dashed"></div>
      <div class="center text-xs bold uppercase">Thank You for Supporting Local Farming!</div>
      <div class="center text-[10px]">www.freshnlocal.co</div>
      <div class="cut-indicator center text-[9px]">- - - - - - TEAR HERE - - - - - -</div>
    </div>
  `;
}

export function generateThermalStyles(paperWidth: '80mm' | '58mm' = '80mm'): string {
  const widthMm = paperWidth === '58mm' ? '54mm' : '76mm';
  const widthPx = paperWidth === '58mm' ? '220px' : '300px';

  return `
    @page {
      size: ${paperWidth} auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
      font-size: 12px;
      line-height: 1.25;
    }
    .thermal-slip {
      width: ${widthPx};
      max-width: ${widthMm};
      margin: 0 auto;
      padding: 6px 4px 16px 4px;
      background: #fff;
      color: #000;
      page-break-after: always;
      break-after: page;
    }
    .width-58 {
      width: 216px;
      max-width: 54mm;
      font-size: 11px;
    }
    .width-80 {
      width: 296px;
      max-width: 76mm;
      font-size: 12px;
    }
    .center {
      text-align: center;
    }
    .right {
      text-align: right;
    }
    .bold {
      font-weight: 900;
    }
    .italic {
      font-style: italic;
    }
    .text-lg {
      font-size: 16px;
      letter-spacing: 0.5px;
    }
    .text-md {
      font-size: 14px;
      letter-spacing: 0.5px;
    }
    .text-sm {
      font-size: 12px;
    }
    .text-xs {
      font-size: 10.5px;
    }
    .divider-double {
      border-top: 2px dashed #000;
      border-bottom: 1px dashed #000;
      height: 3px;
      margin: 6px 0;
    }
    .divider-dashed {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .divider-solid {
      border-top: 1.5px solid #000;
      margin: 5px 0;
    }
    .highlight-box {
      border: 1.5px solid #000;
      padding: 3px;
      margin: 3px 0;
      display: block;
      font-weight: bold;
    }
    .meta-table, .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    .meta-table td, .totals-table td {
      padding: 1.5px 0;
      vertical-align: top;
    }
    .phone-number {
      font-size: 13px;
      letter-spacing: 0.5px;
      margin: 2px 0;
    }
    .address-box {
      border-left: 2px solid #000;
      padding-left: 5px;
      margin-top: 2px;
      word-break: break-word;
    }
    .note-box {
      border: 1px dotted #000;
      padding: 4px;
      margin-top: 2px;
      background: #fafafa;
    }
    .items-header {
      display: flex;
      padding: 2px 0;
      font-size: 11px;
    }
    .col-chk {
      width: 22px;
      text-align: center;
      flex-shrink: 0;
    }
    .col-item {
      flex: 1;
      padding-left: 2px;
    }
    .col-qty {
      width: 36px;
      flex-shrink: 0;
    }
    .col-price {
      width: 52px;
      flex-shrink: 0;
    }
    .item-row {
      padding: 4px 0;
      border-bottom: 1px dotted #ccc;
    }
    .item-row:last-child {
      border-bottom: none;
    }
    .item-top {
      display: flex;
      align-items: flex-start;
      line-height: 1.2;
    }
    .checkbox {
      width: 22px;
      font-family: monospace;
      font-weight: bold;
      font-size: 12px;
      flex-shrink: 0;
    }
    .item-num {
      width: 20px;
      flex-shrink: 0;
      font-size: 10px;
    }
    .item-name {
      flex: 1;
      font-size: 11.5px;
      word-break: break-word;
      padding-right: 4px;
    }
    .item-qty {
      width: 36px;
      flex-shrink: 0;
      font-size: 12px;
    }
    .item-amt {
      width: 52px;
      flex-shrink: 0;
      font-size: 11px;
    }
    .item-sub {
      padding-left: 22px;
      color: #333;
      margin-top: 1px;
    }
    .unit-badge {
      display: inline-block;
      border: 1px solid #000;
      padding: 0 3px;
      font-weight: bold;
      border-radius: 2px;
      margin-right: 4px;
      font-size: 9.5px;
    }
    .pack-summary {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 11px;
    }
    .badge-count {
      font-size: 12px;
      text-decoration: underline;
    }
    .total-row {
      font-size: 13px;
      border-top: 1px solid #000;
    }
    .total-row td {
      padding-top: 4px;
    }
    .cut-indicator {
      margin-top: 14px;
      letter-spacing: 1px;
      color: #666;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .thermal-slip {
        page-break-after: always;
        break-after: page;
      }
      .thermal-slip:last-child {
        page-break-after: avoid;
        break-after: avoid;
      }
    }
  `;
}

/**
 * Triggers printing of a single order thermal packing slip
 */
/**
 * Direct print dispatcher that renders content in a dedicated print container
 * and invokes the browser native system print dialog without hidden iframe blocks.
 */
export function dispatchDirectPrint(contentHtml: string, cssStyles: string, jobTitle: string = 'Thermal Print Job'): void {
  let mount = document.getElementById('thermal-print-container');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'thermal-print-container';
    document.body.appendChild(mount);
  }

  let styleTag = document.getElementById('thermal-print-dynamic-style') as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'thermal-print-dynamic-style';
    document.head.appendChild(styleTag);
  }

  styleTag.innerHTML = `
    @media screen {
      #thermal-print-container {
        display: none !important;
      }
    }
    @media print {
      body > *:not(#thermal-print-container),
      #root {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }
      #thermal-print-container {
        display: block !important;
        visibility: visible !important;
        position: static !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        background: #ffffff !important;
      }
      ${cssStyles}
    }
  `;

  mount.innerHTML = contentHtml;

  const prevTitle = document.title;
  document.title = jobTitle;

  const cleanup = () => {
    document.title = prevTitle;
    if (mount) mount.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  setTimeout(() => {
    try {
      window.focus();
      window.print();
    } catch (err) {
      console.warn('Direct window.print error, attempting popup fallback:', err);
      try {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8" />
                <title>${jobTitle}</title>
                <style>${cssStyles}</style>
              </head>
              <body>
                ${contentHtml}
                <script>
                  window.onload = function() {
                    window.focus();
                    window.print();
                  };
                </script>
              </body>
            </html>
          `);
          win.document.close();
        }
      } catch (fallbackErr) {
        console.error('Fallback window.open failed:', fallbackErr);
      }
    }
  }, 100);
}

/**
 * Triggers printing of a single order thermal packing slip
 */
export function printThermalSlip(order: any, options: ThermalPrintOptions = {}): void {
  const slipHtml = generateSingleSlipHtml(order, options);
  dispatchDirectPrint(
    slipHtml,
    generateThermalStyles(options.paperWidth || '80mm'),
    `Packing Slip - ${order.orderNumber || order.id}`
  );
}

/**
 * Batch prints multiple order slips in one job
 */
export function printBatchThermalSlips(orders: any[], options: ThermalPrintOptions = {}): void {
  if (!orders || orders.length === 0) return;

  const slipsHtml = orders.map(ord => generateSingleSlipHtml(ord, options)).join('\n');
  dispatchDirectPrint(
    slipsHtml,
    generateThermalStyles(options.paperWidth || '80mm'),
    `Batch Packing Slips (${orders.length} Orders)`
  );
}

/**
 * 79mm x 50mm Sticker Label Printer Implementation for IDPRT SP410BT
 */
export interface ItemLabelData {
  orderNumber: string;
  orderId?: string;
  customerName: string;
  customerPhone?: string;
  deliveryType?: 'pickup' | 'delivery' | string;
  address?: string;
  itemName: string;
  itemCode?: string;
  unit?: string;
  variantName?: string;
  price?: number;
  orderQty: number;
  printQty: number;
  date?: string;
  storeName?: string;
}

export function generateQrCodeSvg(text: string, size = 66): string {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const moduleSize = size / count;
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.modules.get(r, c)) {
          const x = (c * moduleSize).toFixed(2);
          const y = (r * moduleSize).toFixed(2);
          const w = (moduleSize + 0.05).toFixed(2);
          path += `M${x},${y}h${w}v${w}h-${w}z `;
        }
      }
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block; shape-rendering:crispEdges;"><path d="${path}" fill="#000000" /></svg>`;
  } catch (err) {
    return '';
  }
}

export type LabelOrientation = 'horizontal' | 'rotate180' | 'rotate90' | 'rotate270' | 'rotated';

export function generateLabelStyles(orientation: LabelOrientation = 'horizontal'): string {
  const normOrientation = orientation === 'rotated' ? 'rotate90' : orientation;

  let pageRule = 'size: 79mm 50mm; margin: 0mm;';
  let bodyPrintWidth = 'width: 79mm !important; height: 50mm !important;';
  let stickerTransform = '';
  let stickerTransformOrigin = '';

  if (normOrientation === 'rotate180') {
    pageRule = 'size: 79mm 50mm; margin: 0mm;';
    bodyPrintWidth = 'width: 79mm !important; height: 50mm !important;';
    stickerTransform = 'transform: rotate(180deg);';
    stickerTransformOrigin = 'transform-origin: center center;';
  } else if (normOrientation === 'rotate90') {
    pageRule = 'size: 50mm 79mm; margin: 0mm;';
    bodyPrintWidth = 'width: 50mm !important; height: 79mm !important;';
    stickerTransform = 'transform: rotate(90deg) translate(0, -50mm);';
    stickerTransformOrigin = 'transform-origin: top left;';
  } else if (normOrientation === 'rotate270') {
    pageRule = 'size: 50mm 79mm; margin: 0mm;';
    bodyPrintWidth = 'width: 50mm !important; height: 79mm !important;';
    stickerTransform = 'transform: rotate(-90deg) translate(-79mm, 0);';
    stickerTransformOrigin = 'transform-origin: top left;';
  }

  return `
    @page {
      ${pageRule}
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        ${bodyPrintWidth}
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .label-sticker-page {
        width: 79mm !important;
        height: 50mm !important;
        max-width: 79mm !important;
        max-height: 50mm !important;
        ${stickerTransform ? `${stickerTransform} !important;` : ''}
        ${stickerTransformOrigin ? `${stickerTransformOrigin} !important;` : ''}
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .label-sticker-page:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #000000;
      background: #ffffff;
    }
    .label-sticker-page {
      width: 79mm;
      height: 50mm;
      max-height: 50mm;
      box-sizing: border-box;
      padding: 2mm 3mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: #ffffff;
      position: relative;
      ${stickerTransform}
      ${stickerTransformOrigin}
    }
    .label-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #000000;
      padding-bottom: 0.5mm;
      margin-bottom: 0.4mm;
    }
    .label-brand {
      font-size: 8pt;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .label-order-tag {
      font-size: 7.5pt;
      font-weight: 900;
      font-family: monospace;
      background: #000000;
      color: #ffffff;
      padding: 0.3mm 1.6mm;
      border-radius: 2px;
      white-space: nowrap;
    }
    .label-sub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 7pt;
      margin-bottom: 0.4mm;
      font-weight: 700;
      color: #111111;
    }
    .label-customer-name {
      max-width: 48mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
      font-weight: 800;
    }
    .label-dest-badge {
      font-size: 6.2pt;
      font-weight: 900;
      text-transform: uppercase;
      border: 1px solid #000000;
      padding: 0.2mm 1mm;
      border-radius: 2px;
    }
    .label-hero-row {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2mm;
      border-top: 1px dashed #000000;
      border-bottom: 1px dashed #000000;
      padding: 0.8mm 0;
      margin: 0.3mm 0;
      min-height: 22mm;
      overflow: hidden;
    }
    .label-hero-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding-right: 1.5mm;
    }
    .label-code-badge {
      display: inline-flex;
      align-items: center;
      background: #000000;
      color: #ffffff;
      font-weight: 900;
      font-size: 8.5pt;
      font-family: monospace;
      padding: 0.2mm 1.8mm;
      border-radius: 2px;
      margin-bottom: 0.5mm;
      align-self: flex-start;
      letter-spacing: 0.4px;
    }
    .label-item-name {
      font-size: 12.5pt;
      font-weight: 900;
      line-height: 1.1;
      text-transform: uppercase;
      color: #000000;
      max-height: 12mm;
      overflow: hidden;
      word-break: break-word;
    }
    .label-item-meta {
      font-size: 7.5pt;
      font-weight: 700;
      color: #222222;
      margin-top: 0.5mm;
      display: flex;
      align-items: center;
      gap: 2mm;
      flex-wrap: wrap;
    }
    .label-hero-qr {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 0.4mm 1mm;
      background: #ffffff;
      border-left: 1px dotted #888888;
    }
    .label-qr-caption {
      font-size: 5.5pt;
      font-family: monospace;
      font-weight: 800;
      color: #000000;
      text-align: center;
      margin-top: 0.3mm;
      max-width: 20mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .label-qr-code {
      font-size: 6pt;
      font-family: monospace;
      font-weight: 900;
      color: #000000;
      background: #f0f0f0;
      border-radius: 2px;
      padding: 0 1.5px;
      text-align: center;
      margin-top: 0.2mm;
    }
    .label-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 0.6mm;
      font-size: 7pt;
      font-weight: 700;
    }
    .label-sticker-counter {
      font-size: 8pt;
      font-weight: 900;
      font-family: monospace;
      border: 1.5px solid #000000;
      padding: 0.4mm 2mm;
      border-radius: 2px;
      background: #ffffff;
      white-space: nowrap;
    }
  `;
}

export function generateSingleItemLabelHtml(
  labelData: ItemLabelData,
  index: number = 1,
  totalInBatch: number = 1
): string {
  const storeName = labelData.storeName || 'FRESH N LOCAL CO.';
  const orderNum = labelData.orderNumber || (labelData.orderId ? `#FNL-${labelData.orderId.slice(0, 8).toUpperCase()}` : '#ORDER');
  const custName = labelData.customerName || 'Valued Customer';
  const itemName = labelData.itemName || 'Produce Item';
  const itemCode = labelData.itemCode ? (labelData.itemCode.startsWith('#') ? labelData.itemCode : `#${labelData.itemCode}`) : '';
  const unit = labelData.unit || labelData.variantName || '';
  const price = labelData.price !== undefined && labelData.price !== null && labelData.price > 0 
    ? `₹${Number(labelData.price).toFixed(2).replace(/\.00$/, '')}` 
    : '';
  const isPickup = labelData.deliveryType === 'pickup' || labelData.address?.includes('Store Pickup');
  const dateStr = labelData.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  // Generate QR code encoding both Item Code and Order ID (plus product name)
  const qrText = `Order: ${orderNum}\nItem Code: ${itemCode || 'N/A'}\nItem: ${itemName}`;
  const qrSvg = generateQrCodeSvg(qrText, 62);

  return `
    <div class="label-sticker-page">
      <!-- Top Row: Brand & Order No -->
      <div class="label-header">
        <span class="label-brand">${storeName}</span>
        <span class="label-order-tag">${orderNum}</span>
      </div>

      <!-- Customer & Mode Row -->
      <div class="label-sub-row">
        <span class="label-customer-name">CUST: ${custName}</span>
        <span class="label-dest-badge">${isPickup ? 'STORE PICKUP' : 'HOME DELIVERY'}</span>
      </div>

      <!-- Hero Section: Left Product Details + Right QR Code -->
      <div class="label-hero-row">
        <div class="label-hero-left">
          ${itemCode ? `<div class="label-code-badge">ITEM CODE: ${itemCode}</div>` : ''}
          <div class="label-item-name">${itemName}</div>
          <div class="label-item-meta">
            ${unit ? `<span>Pack: <b>${unit}</b></span>` : ''}
            ${price ? `<span>Rate: <b>${price}</b></span>` : ''}
            <span>Order Qty: <b>${labelData.orderQty || 1}</b></span>
          </div>
        </div>
        <div class="label-hero-qr">
          ${qrSvg}
          <span class="label-qr-caption">${orderNum}</span>
          ${itemCode ? `<span class="label-qr-code">${itemCode}</span>` : ''}
        </div>
      </div>

      <!-- Footer Row: Date & Sticker Counter -->
      <div class="label-footer">
        <span style="font-size:6.8pt; font-family:monospace; color:#333;">${dateStr} • Fresh Produce</span>
        <div class="label-sticker-counter">
          STICKER ${index} OF ${totalInBatch}
        </div>
      </div>
    </div>
  `;
}

export function printItemLabels(
  labels: ItemLabelData | ItemLabelData[],
  orientation: LabelOrientation = 'horizontal'
): void {
  const items = Array.isArray(labels) ? labels : [labels];
  if (items.length === 0) return;

  let pagesHtml = '';
  for (const item of items) {
    const qtyToPrint = Math.max(1, Number(item.printQty) || 1);
    for (let i = 1; i <= qtyToPrint; i++) {
      pagesHtml += generateSingleItemLabelHtml(item, i, qtyToPrint);
    }
  }

  dispatchDirectPrint(
    pagesHtml,
    generateLabelStyles(orientation),
    'Sticker Labels 79x50mm - IDPRT SP410BT'
  );
}

export function extractItemLabelData(
  order: any,
  item: any,
  printQty?: number,
  catalogProducts?: any[]
): ItemLabelData {
  const prod = item?.product || item || {};
  const orderNum = order?.orderNumber || (order?.id ? `#FNL-${order.id.slice(0, 8).toUpperCase()}` : '#FNL');
  const isPickup = order?.shippingDetails?.address?.includes('Store Pickup') || order?.deliveryType === 'pickup';
  const customerName = order?.shippingDetails?.name || order?.customerName || order?.userName || 'Customer';
  const customerPhone = order?.shippingDetails?.phone || order?.phone || '';
  const orderQty = Math.max(1, Number(item?.quantity) || 1);
  const actualPrintQty = printQty !== undefined ? Math.max(1, Number(printQty) || 1) : orderQty;

  let itemCode = prod.itemCode || item.itemCode || item.product?.itemCode || '';
  if (!itemCode && Array.isArray(catalogProducts)) {
    const match = catalogProducts.find(p => (prod.id && p.id === prod.id) || (p.name && prod.name && p.name.toLowerCase() === prod.name.toLowerCase()));
    if (match?.itemCode) {
      itemCode = match.itemCode;
    }
  }

  let rawPrice = 0;
  if (item?.price !== undefined && item?.price !== null && item?.price !== '') {
    rawPrice = item.price;
  } else if (prod.price !== undefined && prod.price !== null && prod.price !== '') {
    rawPrice = prod.price;
  }
  const price = Number(rawPrice) || 0;

  return {
    orderNumber: orderNum,
    orderId: order?.id,
    customerName,
    customerPhone,
    deliveryType: isPickup ? 'pickup' : 'delivery',
    address: order?.shippingDetails?.address || order?.address || '',
    itemName: prod.name || prod.title || item.name || item.title || 'Produce Item',
    itemCode,
    unit: prod.unit || prod.selectedUnit || item.unit || item.selectedUnit || '',
    variantName: prod.variantName || item.variantName || '',
    price,
    orderQty,
    printQty: actualPrintQty,
    date: order?.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  };
}


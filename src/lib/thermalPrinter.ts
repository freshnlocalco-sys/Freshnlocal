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

/**
 * Calculates and formats the total weight or units for packing slips
 * (e.g. 500 gm * 3 = 1.5 Kg, 250 ml * 4 = 1 L, 1 pack * 6 = 6 packs)
 */
export function formatItemTotalWeightOrUnits(qty: number, unitStr: string | undefined): string {
  if (!unitStr) return `${qty}`;
  const cleanUnit = unitStr.trim();

  const match = cleanUnit.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const val = parseFloat(match[1]);
    const unitPart = match[2].trim();
    if (!isNaN(val) && val > 0) {
      const totalVal = val * qty;
      const lowerUnit = unitPart.toLowerCase();

      // Grams to Kg
      if ((lowerUnit === 'g' || lowerUnit === 'gm' || lowerUnit === 'gram' || lowerUnit === 'grams') && totalVal >= 1000) {
        const kgVal = totalVal / 1000;
        return `${kgVal.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} Kg`;
      }
      if (lowerUnit === 'g' || lowerUnit === 'gm' || lowerUnit === 'gram' || lowerUnit === 'grams') {
        return `${totalVal.toFixed(0)} gm`;
      }

      // Milliliters to Litres
      if ((lowerUnit === 'ml' || lowerUnit === 'milli' || lowerUnit === 'milliliter' || lowerUnit === 'milliliters') && totalVal >= 1000) {
        const lVal = totalVal / 1000;
        return `${lVal.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} L`;
      }
      if (lowerUnit === 'ml' || lowerUnit === 'milli' || lowerUnit === 'milliliter' || lowerUnit === 'milliliters') {
        return `${totalVal.toFixed(0)} ml`;
      }

      // Kg
      if (lowerUnit === 'kg' || lowerUnit === 'kgs' || lowerUnit === 'kilo' || lowerUnit === 'kilogram' || lowerUnit === 'kilograms') {
        return `${totalVal.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} Kg`;
      }

      // Other unit with number like "1 pack", "1 bunch", "1 box", "1 pc"
      if (unitPart) {
        const cleanVal = totalVal.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
        return `${cleanVal} ${totalVal > 1 && !unitPart.endsWith('s') && !['kg', 'gm', 'g', 'ml', 'l'].includes(lowerUnit) ? `${unitPart}s` : unitPart}`;
      }
    }
  }

  // Word-based units: "pack", "bunch", "box", "pc", "bottle"
  const lower = cleanUnit.toLowerCase();
  if (lower === 'pack') return `${qty} ${qty > 1 ? 'packs' : 'pack'}`;
  if (lower === 'bunch') return `${qty} ${qty > 1 ? 'bunches' : 'bunch'}`;
  if (lower === 'box') return `${qty} ${qty > 1 ? 'boxes' : 'box'}`;
  if (lower === 'piece' || lower === 'pc') return `${qty} ${qty > 1 ? 'pcs' : 'pc'}`;
  if (lower === 'bottle') return `${qty} ${qty > 1 ? 'bottles' : 'bottle'}`;
  if (lower === 'kg' || lower === 'kgs') return `${qty} Kg`;

  return `${qty} ${cleanUnit}`;
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
    const totalQtyFormatted = formatItemTotalWeightOrUnits(qty, unit);

    return {
      name,
      itemCode,
      qty,
      price,
      unit,
      variantName,
      total,
      totalQtyFormatted,
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
  const customerEmail = order.shippingDetails?.email || order.customerEmail || order.userEmail || order.email || order.shippingAddress?.email || '';
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
      ${customerEmail ? `<div class="customer-email">✉️ ${customerEmail}</div>` : ''}
      
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
                <span class="total-qty-badge bold">📦 Total: ${it.totalQtyFormatted}</span>
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
    .thermal-slip, .thermal-slip * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
      }
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
      font-size: 12px;
      line-height: 1.25;
    }
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
    .customer-email {
      font-size: 11px;
      font-weight: bold;
      font-family: monospace;
      word-break: break-all;
      margin: 1px 0 3px 0;
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
    .total-qty-badge {
      display: inline-block;
      border: 1.5px solid #000;
      padding: 0 4px;
      font-weight: 900;
      border-radius: 2px;
      margin-left: 3px;
      font-size: 10px;
      background: #f4f4f4;
      color: #000;
      letter-spacing: 0.2px;
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
 * Direct print dispatcher that renders content inside an isolated hidden iframe
 * so that the browser does not need to parse or freeze the main React app DOM.
 * This makes print preview open significantly faster and prevents main window layout shifts.
 */
export function dispatchDirectPrint(contentHtml: string, cssStyles: string, jobTitle: string = 'Thermal Print Job'): void {
  // Remove any previous print iframe or legacy print elements
  const existingIframe = document.getElementById('thermal-print-iframe');
  if (existingIframe && existingIframe.parentNode) {
    existingIframe.parentNode.removeChild(existingIframe);
  }
  const legacyMount = document.getElementById('thermal-print-container');
  if (legacyMount && legacyMount.parentNode) {
    legacyMount.parentNode.removeChild(legacyMount);
  }
  const legacyStyle = document.getElementById('thermal-print-dynamic-style');
  if (legacyStyle && legacyStyle.parentNode) {
    legacyStyle.parentNode.removeChild(legacyStyle);
  }

  // Create isolated invisible iframe to avoid freezing or parsing the main app DOM
  const iframe = document.createElement('iframe');
  iframe.id = 'thermal-print-iframe';
  iframe.setAttribute('style', 'position:fixed; top:0; left:0; width:0; height:0; border:0; visibility:hidden; z-index:-999;');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!iframeDoc) {
    console.error('Failed to access iframe document for printing');
    return;
  }

  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${jobTitle}</title>
        <style>
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          ${cssStyles}
        </style>
      </head>
      <body>
        ${contentHtml}
      </body>
    </html>
  `;

  iframeDoc.open();
  iframeDoc.write(fullHtml);
  iframeDoc.close();

  const iframeWin = iframe.contentWindow;
  if (!iframeWin) return;

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch (_) {}
  };

  iframeWin.addEventListener('afterprint', cleanup);
  // Safety timeout cleanup after 60 seconds
  setTimeout(cleanup, 60000);

  // Allow iframe layout to finish and trigger print dialog
  setTimeout(() => {
    try {
      iframeWin.focus();
      iframeWin.print();
    } catch (err) {
      console.warn('Iframe print failed, falling back to window.open:', err);
      try {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(fullHtml);
          win.document.close();
          win.focus();
          win.print();
        }
      } catch (fallbackErr) {
        console.error('Fallback print failed:', fallbackErr);
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

export type LabelOrientation = 'portrait' | 'horizontal' | 'system_auto' | 'rotate180' | 'rotate90' | 'rotate270' | 'rotated';

const LABEL_ORIENTATION_STORAGE_KEY = 'fnl_label_orientation_v2';

export function getSavedLabelOrientation(): LabelOrientation {
  try {
    const val = localStorage.getItem(LABEL_ORIENTATION_STORAGE_KEY) as LabelOrientation;
    if (val && ['portrait', 'horizontal', 'system_auto', 'rotate180', 'rotate90', 'rotate270'].includes(val)) {
      return val;
    }
    const legacy = localStorage.getItem('fnl_label_orientation') as LabelOrientation;
    if (legacy && ['system_auto', 'rotate180', 'rotate90', 'rotate270'].includes(legacy)) {
      return legacy;
    }
  } catch (e) {
    // Ignore error
  }
  return 'portrait';
}

export function saveLabelOrientation(orientation: LabelOrientation): void {
  try {
    localStorage.setItem(LABEL_ORIENTATION_STORAGE_KEY, orientation);
    localStorage.setItem('fnl_label_orientation', orientation);
  } catch (e) {
    // Ignore error
  }
}

export function generateLabelStyles(orientation: LabelOrientation = 'portrait'): string {
  const normOrientation = orientation === 'rotated' ? 'rotate90' : orientation;

  let pageRule = 'size: 78mm 50mm; margin: 0mm;';
  let bodyPrintWidth = 'width: 78mm !important; height: 50mm !important; margin: 0 auto !important;';
  let stickerTransform = '';
  let stickerTransformOrigin = '';

  if (normOrientation === 'system_auto') {
    pageRule = 'size: auto; margin: 0mm;';
    bodyPrintWidth = 'margin: 0 !important; padding: 0 !important;';
  } else if (normOrientation === 'rotate180') {
    pageRule = 'size: 78mm 50mm; margin: 0mm;';
    stickerTransform = 'transform: rotate(180deg);';
    stickerTransformOrigin = 'transform-origin: center center;';
  } else if (normOrientation === 'rotate90') {
    pageRule = 'size: 50mm 78mm; margin: 0mm;';
    bodyPrintWidth = 'width: 50mm !important; height: 78mm !important;';
    stickerTransform = 'transform: rotate(90deg) translate(0, -50mm);';
    stickerTransformOrigin = 'transform-origin: top left;';
  } else if (normOrientation === 'rotate270') {
    pageRule = 'size: 50mm 78mm; margin: 0mm;';
    bodyPrintWidth = 'width: 50mm !important; height: 78mm !important;';
    stickerTransform = 'transform: rotate(-90deg) translate(-78mm, 0);';
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
        width: 74mm !important;
        max-width: 74mm !important;
        height: 46.5mm !important;
        max-height: 47mm !important;
        padding: 1.5mm 3mm !important;
        margin: 0 auto !important;
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
    .label-sticker-page, .label-sticker-page * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    }
    .label-sticker-page {
      width: 74mm;
      height: 46.5mm;
      max-width: 74mm;
      max-height: 47mm;
      box-sizing: border-box;
      padding: 1.5mm 3mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: #ffffff;
      color: #000000;
      position: relative;
      margin: 0 auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      ${stickerTransform}
      ${stickerTransformOrigin}
    }
    .label-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #000000;
      padding-bottom: 0.4mm;
      margin-bottom: 0.4mm;
      padding-right: 2mm;
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
      background: #ffffff;
      color: #000000;
      border: 1.2px solid #000000;
      padding: 0.2mm 1.8mm;
      border-radius: 3px;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    .label-sub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 6.8pt;
      margin-bottom: 0.4mm;
      font-weight: 700;
      color: #111111;
      gap: 1mm;
      padding-right: 2mm;
    }
    .label-customer-name {
      max-width: 42mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
      font-weight: 800;
    }
    .label-dest-badge {
      font-size: 6pt;
      font-weight: 900;
      text-transform: uppercase;
      border: 1px solid #000000;
      padding: 0.2mm 1mm;
      border-radius: 2px;
      white-space: nowrap;
    }
    .label-hero-row {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2mm;
      border-top: 1px dashed #000000;
      border-bottom: 1px dashed #000000;
      padding: 0.6mm 0;
      margin: 0.3mm 0;
      min-height: 20mm;
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
      background: #ffffff;
      color: #000000;
      border: 1.2px solid #000000;
      font-weight: 900;
      font-size: 8pt;
      font-family: monospace;
      padding: 0.2mm 1.8mm;
      border-radius: 3px;
      margin-bottom: 0.6mm;
      align-self: flex-start;
      letter-spacing: 0.3px;
    }
    .label-item-name {
      font-size: 11pt;
      font-weight: 900;
      line-height: 1.15;
      text-transform: uppercase;
      color: #000000;
      max-height: 12mm;
      overflow: hidden;
      word-break: break-word;
    }
    .label-item-meta {
      font-size: 7pt;
      font-weight: 700;
      color: #222222;
      margin-top: 0.4mm;
      display: flex;
      align-items: center;
      gap: 1.8mm;
      flex-wrap: wrap;
    }
    .label-hero-qr {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 0.2mm 1.5mm;
      margin-right: 3.5mm;
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
      max-width: 22mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .label-qr-code {
      font-size: 6pt;
      font-family: monospace;
      font-weight: 900;
      color: #000000;
      background: #ffffff;
      border: 1px solid #777777;
      border-radius: 2px;
      padding: 0.2px 2px;
      text-align: center;
      margin-top: 0.3mm;
    }
    .label-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 0.4mm;
      font-size: 6.8pt;
      font-weight: 700;
    }
    .label-sticker-counter {
      font-size: 7.5pt;
      font-weight: 900;
      font-family: monospace;
      border: 1.5px solid #000000;
      padding: 0.3mm 1.8mm;
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
  const dateStr = labelData.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Generate QR code encoding both Item Code and Order ID (plus product name)
  const qrText = `Order: ${orderNum}\nItem Code: ${itemCode || 'N/A'}\nItem: ${itemName}`;
  const qrSvg = generateQrCodeSvg(qrText, 46);

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
            <span>Order Qty: <b>${labelData.orderQty || 1}</b></span>
          </div>
        </div>
        <div class="label-hero-qr">
          ${qrSvg}
          <span class="label-qr-caption">${orderNum}</span>
          ${itemCode ? `<span class="label-qr-code">${itemCode}</span>` : ''}
        </div>
      </div>

      <!-- Footer Row: Date & Produce Guarantee -->
      <div class="label-footer">
        <span style="font-size:6.8pt; font-family:monospace; color:#222; font-weight:800;">Date: ${dateStr}</span>
        <span style="font-size:6.2pt; font-weight:900; font-family:monospace; color:#222; letter-spacing:0.3px; text-transform:uppercase;">Fresh Produce • Verified</span>
      </div>
    </div>
  `;
}

export function printItemLabels(
  labels: ItemLabelData | ItemLabelData[],
  orientation?: LabelOrientation
): void {
  const actualOrientation = orientation || getSavedLabelOrientation();
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
    generateLabelStyles(actualOrientation),
    'Sticker Labels 78x50mm - IDPRT SP410BT'
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
    // Always use today's printing date for sticker labels (never order creation date)
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
}


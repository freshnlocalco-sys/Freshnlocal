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
    const unit = prod.unit || prod.selectedUnit || it.unit || it.selectedUnit || '';
    const variantName = prod.variantName || it.variantName || prod.selectedVariant || it.selectedVariant || '';
    const total = qty * price;

    return {
      name,
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
                <span class="item-name bold">${it.name}</span>
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
export function printThermalSlip(order: any, options: ThermalPrintOptions = {}): void {
  const printContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Packing Slip - ${order.orderNumber || order.id}</title>
        <style>
          ${generateThermalStyles(options.paperWidth || '80mm')}
        </style>
      </head>
      <body>
        ${generateSingleSlipHtml(order, options)}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() {
              window.close();
            }, 500);
          };
        </script>
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(printContent);
      win.document.close();
    }
    return;
  }

  doc.open();
  doc.write(printContent);
  doc.close();

  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch (e) {
      // ignore
    }
  }, 60000);
}

/**
 * Batch prints multiple order slips in one job
 */
export function printBatchThermalSlips(orders: any[], options: ThermalPrintOptions = {}): void {
  if (!orders || orders.length === 0) return;

  const slipsHtml = orders.map(ord => generateSingleSlipHtml(ord, options)).join('\n');

  const printContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Batch Packing Slips (${orders.length} Orders)</title>
        <style>
          ${generateThermalStyles(options.paperWidth || '80mm')}
        </style>
      </head>
      <body>
        ${slipsHtml}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() {
              window.close();
            }, 500);
          };
        </script>
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(printContent);
      win.document.close();
    }
    return;
  }

  doc.open();
  doc.write(printContent);
  doc.close();

  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch (e) {
      // ignore
    }
  }, 60000);
}

import React, { useState, useEffect, useMemo } from 'react';
import { X, Printer, Settings2, CheckSquare, DollarSign, FileText, Tag, Plus, Minus, Layers, CheckCircle } from 'lucide-react';
import { 
  printThermalSlip, 
  generateSingleSlipHtml, 
  generateThermalStyles,
  printItemLabels,
  extractItemLabelData,
  generateSingleItemLabelHtml,
  generateLabelStyles,
  ItemLabelData,
  LabelOrientation,
  getSavedLabelOrientation,
  saveLabelOrientation
} from '../lib/thermalPrinter';
import { useProducts } from '../store/useProducts';
import toast from 'react-hot-toast';

interface ThermalPackingSlipModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
}

export function ThermalPackingSlipModal({ order, isOpen, onClose }: ThermalPackingSlipModalProps) {
  const { products } = useProducts();
  const [activeTab, setActiveTab] = useState<'slip' | 'labels'>('slip');
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [showPrices, setShowPrices] = useState(true);
  const [includeCheckboxes, setIncludeCheckboxes] = useState(true);
  const [labelOrientation, setLabelOrientation] = useState<LabelOrientation>(() => getSavedLabelOrientation());

  const handleOrientationChange = (newOrientation: LabelOrientation) => {
    setLabelOrientation(newOrientation);
    saveLabelOrientation(newOrientation);
  };
  
  // Manage printing quantities for each order item (defaulted to item.quantity)
  const [itemPrintQuantities, setItemPrintQuantities] = useState<Record<number, number>>({});
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number>(0);

  useEffect(() => {
    if (order?.items && Array.isArray(order.items)) {
      const initial: Record<number, number> = {};
      order.items.forEach((it: any, idx: number) => {
        initial[idx] = Math.max(1, Number(it?.quantity) || 1);
      });
      setItemPrintQuantities(initial);
      setSelectedPreviewIndex(0);
    }
    if (order?.defaultTab === 'labels') {
      setActiveTab('labels');
    } else {
      setActiveTab('slip');
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const rawItems = Array.isArray(order.items) ? order.items : [];

  const handlePrintSlip = () => {
    printThermalSlip(order, {
      paperWidth,
      showPrices,
      includeCheckboxes,
    });
  };

  const previewHtml = generateSingleSlipHtml(order, {
    paperWidth,
    showPrices,
    includeCheckboxes,
  });

  const previewStyles = generateThermalStyles(paperWidth);

  // Update printing quantity for an item
  const handleQtyChange = (idx: number, val: number) => {
    const safeVal = Math.max(1, Math.min(999, Math.floor(val) || 1));
    setItemPrintQuantities(prev => ({
      ...prev,
      [idx]: safeVal,
    }));
  };

  // Print stickers for a single item
  const handlePrintSingleItemLabel = (item: any, idx: number) => {
    const printQty = itemPrintQuantities[idx] ?? Math.max(1, Number(item?.quantity) || 1);
    const labelData = extractItemLabelData(order, item, printQty, products);
    printItemLabels(labelData, labelOrientation);
    toast.success(`Sent ${printQty} sticker${printQty > 1 ? 's' : ''} to IDPRT SP410BT printer`);
  };

  // Print stickers for all items in the order
  const handlePrintAllItemLabels = () => {
    if (rawItems.length === 0) {
      toast.error('No items in this order to print');
      return;
    }
    const allLabels: ItemLabelData[] = rawItems.map((it: any, idx: number) => {
      const printQty = itemPrintQuantities[idx] ?? Math.max(1, Number(it?.quantity) || 1);
      return extractItemLabelData(order, it, printQty, products);
    });
    const totalCount = allLabels.reduce((sum, l) => sum + (l.printQty || 1), 0);
    printItemLabels(allLabels, labelOrientation);
    toast.success(`Printing ${totalCount} labels for ${allLabels.length} items`);
  };

  // Total stickers count calculation
  const totalStickersToPrint = rawItems.reduce((sum: number, it: any, idx: number) => {
    const q = itemPrintQuantities[idx] ?? Math.max(1, Number(it?.quantity) || 1);
    return sum + q;
  }, 0);

  // Current selected item preview
  const currentItemForPreview = rawItems[selectedPreviewIndex] || rawItems[0] || null;
  const currentItemPreviewQty = currentItemForPreview 
    ? (itemPrintQuantities[selectedPreviewIndex] ?? Math.max(1, Number(currentItemForPreview?.quantity) || 1))
    : 1;

  const labelPreviewData = currentItemForPreview 
    ? extractItemLabelData(order, currentItemForPreview, currentItemPreviewQty, products)
    : null;

  const labelPreviewHtml = labelPreviewData 
    ? generateSingleItemLabelHtml(labelPreviewData, 1, currentItemPreviewQty)
    : '';

  const labelPreviewStyles = generateLabelStyles(labelOrientation);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`bg-secondary border border-border rounded-2xl w-full ${activeTab === 'labels' ? 'max-w-4xl' : 'max-w-xl'} max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative transition-all duration-200`}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
              {activeTab === 'labels' ? <Tag className="w-5 h-5" /> : <Printer className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-foreground flex items-center gap-2">
                {activeTab === 'labels' ? 'Item Labels Printer' : 'Thermal Packing Slip'}
                <span className="text-[10px] bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-mono">
                  {order.orderNumber || `#${order.id?.slice(0, 8).toUpperCase()}`}
                </span>
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                {activeTab === 'labels' 
                  ? 'IDPRT SP410BT • 79mm (W) × 50mm (H) Continuous/Gap Stickers' 
                  : 'Optimized for 80mm & 58mm Thermal Receipt Printers'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-muted/30 rounded-xl text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-card px-4 pt-2 shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('slip')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'slip'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Packing Slip (80/58mm)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('labels')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'labels'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Item Labels (79×50mm Stickers)
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-primary/15 text-primary font-mono font-bold">
              {rawItems.length}
            </span>
          </button>
        </div>

        {/* SLIP VIEW */}
        {activeTab === 'slip' && (
          <>
            {/* Configuration Controls */}
            <div className="p-3 bg-neutral-100 dark:bg-neutral-900 border-b border-border flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1">
                  <Settings2 className="w-3.5 h-3.5" /> Paper:
                </span>
                <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setPaperWidth('80mm')}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-all ${
                      paperWidth === '80mm'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    80mm (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperWidth('58mm')}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-all ${
                      paperWidth === '58mm'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    58mm (Compact)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrices(!showPrices)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase transition-all ${
                    showPrices
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <DollarSign className="w-3 h-3" />
                  {showPrices ? 'Prices Included' : 'No Prices (Pack-Only)'}
                </button>

                <button
                  type="button"
                  onClick={() => setIncludeCheckboxes(!includeCheckboxes)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase transition-all ${
                    includeCheckboxes
                      ? 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  <CheckSquare className="w-3 h-3" />
                  Checkboxes
                </button>
              </div>
            </div>

            {/* Live Thermal Paper Roll Preview */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-200/70 dark:bg-neutral-950 flex justify-center items-start">
              <div
                className="bg-white text-black shadow-xl rounded-sm p-3 relative transition-all border border-neutral-300/80"
                style={{
                  width: paperWidth === '58mm' ? '250px' : '330px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
                }}
              >
                <div
                  className="absolute -top-1.5 left-0 right-0 h-1.5 bg-repeat-x opacity-40"
                  style={{
                    backgroundImage: `radial-gradient(circle, transparent, transparent 2px, #fff 2px, #fff 4px)`,
                    backgroundSize: '8px 8px',
                  }}
                />
                <style dangerouslySetInnerHTML={{ __html: previewStyles }} />
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('labels')}
                className="text-[11px] text-blue-700 hover:text-blue-800 font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Switch to 79×50mm Sticker Labels ({rawItems.length} items)</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Print Slip Now
                </button>
              </div>
            </div>
          </>
        )}

        {/* 79mm x 50mm ITEM LABELS VIEW */}
        {activeTab === 'labels' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Toolbar for Labels */}
            <div className="p-3 bg-neutral-100 dark:bg-neutral-900 border-b border-border flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 bg-neutral-900 text-white rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  IDPRT SP410BT (79×50mm)
                </span>

                {/* Print Orientation Selector */}
                <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-2xs gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('horizontal')}
                    className={`px-2 py-0.5 text-[9.5px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      labelOrientation === 'horizontal'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Horizontal 79×50mm (Default - Prints horizontally on 1 sticker)"
                  >
                    ↔️ Horizontal (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('system_auto')}
                    className={`px-2 py-0.5 text-[9.5px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      labelOrientation === 'system_auto'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="System Adjustable: Unlocks Portrait / Landscape dropdown in browser print options"
                  >
                    ⚙️ System Adjustable
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('rotate180')}
                    className={`px-1.5 py-0.5 text-[9.5px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      labelOrientation === 'rotate180'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Rotates sticker 180 degrees (Inverted Horizontal)"
                  >
                    🔄 180°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('rotate90')}
                    className={`px-1.5 py-0.5 text-[9.5px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      labelOrientation === 'rotate90' || (labelOrientation as any) === 'rotated'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Rotate 90 degrees clockwise (for rolls fed along 50mm width)"
                  >
                    90°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOrientationChange('rotate270')}
                    className={`px-1.5 py-0.5 text-[9.5px] font-black uppercase rounded-md transition-all cursor-pointer ${
                      labelOrientation === 'rotate270'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Rotate 270 degrees counter-clockwise"
                  >
                    270°
                  </button>
                </div>

                <span className="text-[11px] font-extrabold text-foreground">
                  Stickers: <span className="text-primary font-mono">{totalStickersToPrint}</span>
                </span>
              </div>

              <button
                type="button"
                onClick={handlePrintAllItemLabels}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xs cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Print All ({totalStickersToPrint})
              </button>
            </div>

            {/* Split View: Left List of Items (Properly small) + Right Live 79x50mm Sticker Preview */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-neutral-50 dark:bg-neutral-950">
              {/* Left Column: Items List (Compact & small) */}
              <div className="w-full md:w-[360px] lg:w-[380px] shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto p-3 space-y-2">
                <div className="flex items-center justify-between px-1 mb-0.5">
                  <span className="text-[9.5px] font-black uppercase tracking-wider text-muted-foreground">
                    Items List ({rawItems.length})
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    Set Qty & print 🖨️
                  </span>
                </div>

                {rawItems.map((item: any, idx: number) => {
                  const prod = item?.product || item || {};
                  const itemName = prod.name || prod.title || item.name || 'Item';
                  let itemCode = prod.itemCode || item.itemCode || '';
                  if (!itemCode && products?.length) {
                    const match = products.find(p => (prod.id && p.id === prod.id) || (p.name && prod.name && p.name.toLowerCase() === prod.name.toLowerCase()));
                    if (match?.itemCode) itemCode = match.itemCode;
                  }
                  const unit = prod.unit || item.unit || '';
                  const orderQty = Math.max(1, Number(item.quantity) || 1);
                  const printQty = itemPrintQuantities[idx] ?? orderQty;
                  const isSelected = selectedPreviewIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-card border-primary/60 shadow-xs ring-1 ring-primary/20'
                          : 'bg-card/85 border-border hover:border-border/80'
                      }`}
                    >
                      {/* Left Item Information */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-foreground uppercase truncate max-w-[170px]" title={itemName}>
                            {itemName}
                          </span>
                          {itemCode && (
                            <span className="px-1.5 py-0.2 rounded bg-black text-white text-[9px] font-mono font-black tracking-wider shadow-2xs">
                              #{itemCode.replace(/^#/, '')}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                          {unit ? <span className="font-semibold text-foreground/80">{unit} • </span> : ''}
                          Order: <b className="text-foreground">{orderQty}</b>
                        </p>
                      </div>

                      {/* Right Controls: Preview Button + Stepper + Compact Printer Button (No text) */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPreviewIndex(idx)}
                          className={`px-1.5 py-1 rounded-md text-[8.5px] uppercase font-bold tracking-wider cursor-pointer border transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary border-primary/30'
                              : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                          }`}
                          title="Preview this sticker"
                        >
                          {isSelected ? 'View' : 'Prev'}
                        </button>

                        {/* Visible Stepper with Red (-) and Green (+) buttons */}
                        <div className="inline-flex items-center bg-secondary border border-border rounded-lg p-0.5 gap-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(idx, printQty - 1)}
                            disabled={printQty <= 1}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-red-100 dark:bg-red-950/60 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 disabled:opacity-30 transition-all font-black text-xs cursor-pointer shadow-2xs"
                            title="Decrease sticker count"
                          >
                            <Minus className="w-3 h-3 stroke-[3]" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={printQty}
                            onChange={(e) => handleQtyChange(idx, parseInt(e.target.value) || 1)}
                            className="w-8 h-6 text-center font-mono font-black text-[11px] bg-white dark:bg-card border border-border rounded text-foreground outline-none shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            title="Enter number of stickers"
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(idx, printQty + 1)}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 transition-all font-black text-xs cursor-pointer shadow-2xs"
                            title="Increase sticker count"
                          >
                            <Plus className="w-3 h-3 stroke-[3]" />
                          </button>
                        </div>

                        {/* Compact Print Button without text */}
                        <button
                          type="button"
                          onClick={() => handlePrintSingleItemLabel(item, idx)}
                          className="w-7 h-7 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                          title={`Print ${printQty} sticker(s) for ${itemName}`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {rawItems.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-xs font-mono">
                    Zero items found in this order.
                  </div>
                )}
              </div>

              {/* Right Column: Live 79x50mm Sticker Preview */}
              <div className="flex-1 p-4 sm:p-5 flex flex-col items-center justify-start overflow-y-auto bg-neutral-100/50 dark:bg-neutral-900/50">
                <div className="w-full flex items-center justify-between mb-2 max-w-[320px]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Tag className="w-3 h-3 text-primary" /> 79×50mm Horizontal Preview
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    1:1 Thermal Ratio
                  </span>
                </div>

                {/* 79mm x 50mm Visual Container */}
                <div className="w-full flex flex-col items-center justify-center py-1">
                  <div
                    className="bg-white text-black shadow-xl rounded-md p-0 overflow-hidden border-2 border-dashed border-neutral-400 relative transition-all"
                    style={{
                      width: (labelOrientation === 'rotate90' || labelOrientation === 'rotate270' || (labelOrientation as any) === 'rotated') ? '189px' : '298px',
                      height: (labelOrientation === 'rotate90' || labelOrientation === 'rotate270' || (labelOrientation as any) === 'rotated') ? '298px' : '189px',
                    }}
                  >
                    <style dangerouslySetInnerHTML={{ __html: labelPreviewStyles }} />
                    <div dangerouslySetInnerHTML={{ __html: labelPreviewHtml }} />
                  </div>

                  <div className="mt-2.5 max-w-[340px] text-center space-y-1">
                    <p className="text-[9.5px] text-muted-foreground">
                      Previewing 1 of {currentItemPreviewQty} sticker(s) for{' '}
                      <span className="font-bold text-foreground">IDPRT SP410BT</span> •{' '}
                      <span className="font-black text-primary font-mono">
                        {labelOrientation === 'system_auto'
                          ? '⚙️ System Adjustable'
                          : labelOrientation === 'rotate180'
                          ? '180° Inverted'
                          : labelOrientation === 'rotate90' || (labelOrientation as any) === 'rotated'
                          ? '90° Clockwise'
                          : labelOrientation === 'rotate270'
                          ? '270° Counter-Clockwise'
                          : '↔️ Horizontal (Default)'}
                      </span>
                    </p>
                    <p className="text-[8.5px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      ✓ QR Code encodes Order ID & Item Code on right
                    </p>
                  </div>

                  {/* IDPRT Printer Quick Guide */}
                  <div className="mt-2.5 max-w-[340px] text-left space-y-1 bg-amber-500/10 border border-amber-500/25 p-2 rounded-xl text-foreground">
                    <div className="text-[9.5px] font-black uppercase text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <span>🖨️</span>
                      <span>IDPRT Sticker Print Guide</span>
                    </div>
                    <ul className="text-[9px] text-muted-foreground leading-tight space-y-0.5 list-disc list-inside">
                      <li>Use <b>↔️ Horizontal (Default)</b> to print horizontally on 1 sticker (79×50mm).</li>
                      <li>Select <b>⚙️ System Adjustable</b> to adjust <b>Landscape / Portrait</b> in the print preview.</li>
                      <li>In print settings, ensure <b>Margins: None</b> and Paper Size is <b>79×50mm</b> (or 3×2").</li>
                      <li>Tip: Press <kbd className="px-1 py-0.2 bg-card border border-border rounded text-[8px] font-mono font-bold">Ctrl+Shift+P</kbd> for the Windows driver dialog.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
                <span>Ready for IDPRT SP410BT Thermal Label Printer</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrintAllItemLabels}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Print All Item Labels ({totalStickersToPrint})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

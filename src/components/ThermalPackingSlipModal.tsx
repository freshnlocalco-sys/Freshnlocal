import React, { useState } from 'react';
import { X, Printer, Settings2, CheckSquare, DollarSign, FileText } from 'lucide-react';
import { printThermalSlip, generateSingleSlipHtml, generateThermalStyles } from '../lib/thermalPrinter';

interface ThermalPackingSlipModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
}

export function ThermalPackingSlipModal({ order, isOpen, onClose }: ThermalPackingSlipModalProps) {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [showPrices, setShowPrices] = useState(true);
  const [includeCheckboxes, setIncludeCheckboxes] = useState(true);

  if (!isOpen || !order) return null;

  const handlePrint = () => {
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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-secondary border border-border rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-foreground flex items-center gap-2">
                Thermal Packing Slip
                <span className="text-[10px] bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-mono">
                  {order.orderNumber || `#${order.id?.slice(0, 8).toUpperCase()}`}
                </span>
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                Optimized for 80mm &amp; 58mm Thermal Receipt Printers
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
            {/* Scalloped paper roll top edge */}
            <div className="absolute -top-1.5 left-0 right-0 h-1.5 bg-repeat-x opacity-40"
                 style={{
                   backgroundImage: `radial-gradient(circle, transparent, transparent 2px, #fff 2px, #fff 4px)`,
                   backgroundSize: '8px 8px'
                 }}
            />

            <style dangerouslySetInnerHTML={{ __html: previewStyles }} />
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-muted-foreground uppercase font-mono flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>Ready for thermal printer or PDF dispatch</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Slip Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

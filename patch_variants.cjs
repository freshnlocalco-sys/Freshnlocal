const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

const search = `                                            {newProduct.variants && newProduct.variants.length > 0 && (
                        <div className="space-y-3">
                          {newProduct.variants.map((variant, vIdx) => (
                            <div key={vIdx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center bg-white p-2 rounded-lg border border-border">
                              <input 
                                placeholder="Size (e.g. 500g)"
                                value={variant.unit}
                                onChange={(e) => {
                                  const newVariants = [...newProduct.variants];
                                  newVariants[vIdx].unit = e.target.value;
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="w-full border-none bg-transparent text-[10px] sm:text-xs outline-none"
                              />
                              <input 
                                placeholder="Price"
                                type="number"
                                value={variant.price}
                                onChange={(e) => {
                                  const newVariants = [...newProduct.variants];
                                  newVariants[vIdx].price = e.target.value;
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="w-full border-none bg-transparent text-[10px] sm:text-xs outline-none"
                              />
                              <input 
                                placeholder="MRP"
                                type="number"
                                value={variant.originalPrice}
                                onChange={(e) => {
                                  const newVariants = [...newProduct.variants];
                                  newVariants[vIdx].originalPrice = e.target.value;
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="w-full border-none bg-transparent text-[10px] sm:text-xs outline-none"
                              />
                              <input 
                                placeholder="HoReCa Price"
                                type="number"
                                value={variant.horecaPrice}
                                onChange={(e) => {
                                  const newVariants = [...newProduct.variants];
                                  newVariants[vIdx].horecaPrice = e.target.value;
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="w-full border-none bg-transparent text-[10px] sm:text-xs outline-none"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const newVariants = newProduct.variants.filter((_, i) => i !== vIdx);
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="text-red-500 p-1 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}`;

const insert = `                                            {newProduct.variants && newProduct.variants.length > 0 && (
                        <div className="space-y-4">
                          {newProduct.variants.map((variant, vIdx) => (
                            <div key={vIdx} className="bg-white p-4 sm:p-5 rounded-2xl border border-border relative">
                              <button
                                type="button"
                                onClick={() => {
                                  const newVariants = newProduct.variants.filter((_, i) => i !== vIdx);
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="absolute -top-3 -right-3 bg-white text-red-500 p-2 rounded-full border border-border shadow-sm hover:bg-red-50 transition-colors z-10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              
                              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rate Price (₹)</label>
                                  <input 
                                    placeholder="180" 
                                    type="number"
                                    value={variant.price}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].price = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono"
                                  />
                                </div>
                                
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">MRP (Optional ₹)</label>
                                  <input 
                                    placeholder="250" 
                                    type="number"
                                    value={variant.originalPrice}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].originalPrice = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono"
                                  />
                                </div>

                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Price (Optional ₹)</label>
                                  <input 
                                    placeholder="150" 
                                    type="number"
                                    value={variant.horecaPrice}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].horecaPrice = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono"
                                  />
                                </div>

                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Unit / Quantity</label>
                                  <input 
                                    placeholder="400 g, 1 pc, 500 ml..." 
                                    value={variant.unit}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].unit = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}`;

if (code.includes("Different Sizes / Variants")) {
  code = code.replace(search, insert);
  fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
  console.log("Success");
} else {
  console.log("Not found");
}

const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

code = code.replace(
  `<div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Unit / Quantity</label>
                        <input 
                          placeholder="400 g, 1 pc, 500 ml..." 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                          value={newProduct.unit} 
                          onChange={e => setNewProduct({...newProduct, unit: e.target.value})} 
                        />
                      </div>`,
  `<div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Unit / Quantity</label>
                        <input 
                          placeholder="400 g, 1 pc, 500 ml..." 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                          value={newProduct.unit} 
                          onChange={e => setNewProduct({...newProduct, unit: e.target.value})} 
                        />
                      </div>
                      
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Unit (Optional)</label>
                        <input 
                          placeholder="Bulk: 1 kg, 5L, Carton..." 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                          value={newProduct.horecaUnit || ''} 
                          onChange={e => setNewProduct({...newProduct, horecaUnit: e.target.value})} 
                        />
                      </div>`
);


code = code.replace(
  `<div className="space-y-1.5 sm:space-y-2">
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
                                </div>`,
  `<div className="space-y-1.5 sm:space-y-2">
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
                                
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Unit</label>
                                  <input 
                                    placeholder="Bulk Unit" 
                                    value={variant.horecaUnit || ''}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].horecaUnit = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs"
                                  />
                                </div>`
);

code = code.replace(
  `{ unit: '', price: '', originalPrice: '', horecaPrice: '' }`,
  `{ unit: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '' }`
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
console.log("Success3");

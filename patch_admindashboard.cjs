const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

// Update newProduct state initialization
code = code.replace(
  "const [newProduct, setNewProduct] = useState<{ name: string; price: string; originalPrice: string; category: string; subCategory: string; description: string; imageUrl: string; unit: string; variants: { unit: string; price: string; originalPrice: string }[] }>({ name: '', price: '', originalPrice: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });",
  "const [newProduct, setNewProduct] = useState<{ name: string; price: string; originalPrice: string; horecaPrice: string; category: string; subCategory: string; description: string; imageUrl: string; unit: string; variants: { unit: string; price: string; originalPrice: string; horecaPrice: string }[] }>({ name: '', price: '', originalPrice: '', horecaPrice: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });"
);

// Add variantsToSave logic inside handleAddProduct
const searchStr = "const productId = editingProductId || doc(collection(db, 'products')).id;";
const insertStr = `\n      const variantsToSave = (newProduct.variants || []).map(v => ({
        ...v,
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : null,
        horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : null,
      }));`;
code = code.replace(searchStr, searchStr + insertStr);

code = code.replace(
  "          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,\n          category:",
  "          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,\n          horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,\n          category:"
);
code = code.replace(
  "          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,\n          category:",
  "          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,\n          horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,\n          category:"
);
code = code.replace(
  "          variants: newProduct.variants || [],",
  "          variants: variantsToSave,"
);
code = code.replace(
  "          variants: newProduct.variants || [],",
  "          variants: variantsToSave,"
);

code = code.replace(
  "        originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined,\n        category:",
  "        originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined,\n        horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : undefined,\n        category:"
);
code = code.replace(
  "        variants: newProduct.variants || [],",
  "        variants: variantsToSave,"
);

code = code.replace(/setNewProduct\(\{ name: '', price: '', originalPrice: '', /g, "setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', ");

code = code.replace(
  "      originalPrice: product.originalPrice ? product.originalPrice.toString() : '',\n      category:",
  "      originalPrice: product.originalPrice ? product.originalPrice.toString() : '',\n      horecaPrice: product.horecaPrice ? product.horecaPrice.toString() : '',\n      category:"
);

// Add Horeca price inputs
const horecaInput1 = `                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Price (Optional ₹)</label>
                        <input 
                          type="number" 
                          placeholder="150" 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                          value={newProduct.horecaPrice} 
                          onChange={e => setNewProduct({...newProduct, horecaPrice: e.target.value})} 
                        />
                      </div>`;
const searchInput = `                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Unit / Quantity</label>`;
code = code.replace(searchInput, horecaInput1 + "\n\n" + searchInput);

const variantHorecaPrice = `                              <input 
                                placeholder="HoReCa Price"
                                type="number"
                                value={variant.horecaPrice}
                                onChange={(e) => {
                                  const newVariants = [...newProduct.variants];
                                  newVariants[vIdx].horecaPrice = e.target.value;
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="w-full border-none bg-transparent text-[10px] sm:text-xs outline-none"
                              />`;
const variantMrpInputSearch = `                              <button 
                                type="button"
                                onClick={() => {
                                  const newVariants = newProduct.variants.filter((_, i) => i !== vIdx);`;
code = code.replace(variantMrpInputSearch, variantHorecaPrice + "\n" + variantMrpInputSearch);

code = code.replace(
  "                              variants: [...(newProduct.variants || []), { unit: '', price: '', originalPrice: '' }]",
  "                              variants: [...(newProduct.variants || []), { unit: '', price: '', originalPrice: '', horecaPrice: '' }]"
);

code = code.replace(
  `                            <div key={vIdx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center bg-white p-2 rounded-lg border border-border">`,
  `                            <div key={vIdx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center bg-white p-2 rounded-lg border border-border">`
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);

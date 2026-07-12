const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

code = code.replace(
  `const [newProduct, setNewProduct] = useState<{ name: string; price: string; originalPrice: string; horecaPrice: string; category: string; subCategory: string; description: string; imageUrl: string; unit: string; variants: { unit: string; price: string; originalPrice: string; horecaPrice: string }[] }>({ name: '', price: '', originalPrice: '', horecaPrice: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });`,
  `const [newProduct, setNewProduct] = useState<{ name: string; price: string; originalPrice: string; horecaPrice: string; horecaUnit: string; category: string; subCategory: string; description: string; imageUrl: string; unit: string; variants: { unit: string; price: string; originalPrice: string; horecaPrice: string; horecaUnit: string }[] }>({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });`
);

code = code.replace(
  `setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });`,
  `setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });`
);

code = code.replace(
  `setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });`,
  `setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', variants: [] });`
);

code = code.replace(
  `const variantsToSave = (newProduct.variants || []).map(v => ({
        ...v,
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : null,
        horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : null,
      }));`,
  `const variantsToSave = (newProduct.variants || []).map(v => ({
        ...v,
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : null,
        horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : null,
        horecaUnit: v.horecaUnit || '',
      }));`
);

code = code.replace(
  `horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,`,
  `horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,\n          horecaUnit: newProduct.horecaUnit || '',`
);
code = code.replace(
  `horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,`,
  `horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,\n          horecaUnit: newProduct.horecaUnit || '',`
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
console.log("Success");

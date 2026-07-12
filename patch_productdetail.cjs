const fs = require('fs');
let code = fs.readFileSync('src/pages/ProductDetail.tsx', 'utf8');
code = code.replace("import { useAuth } from '../lib/firebase';\n", "");
code = code.replace("  const { user } = useAuth();\n", "");
code = code.replace("originalPrice: product.originalPrice, horecaPrice: product.horecaPrice", "originalPrice: product.originalPrice");
code = code.replace("      horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : undefined\n    }))]", "    }))]");
code = code.replace("  const currentVariant = allVariants[selectedVariantIdx] || allVariants[0] || { unit: '', price: 0, originalPrice: 0, horecaPrice: undefined };", "  const currentVariant = allVariants[selectedVariantIdx] || allVariants[0] || { unit: '', price: 0, originalPrice: 0 };");
code = code.replace("  const isHoreca = user?.role === 'horeca';\n  const currentPrice = isHoreca && currentVariant.horecaPrice ? currentVariant.horecaPrice : currentVariant.price;", "  const currentPrice = currentVariant.price;");
fs.writeFileSync('src/pages/ProductDetail.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/components/ProductCard.tsx', 'utf8');
code = code.replace("import { useAuth } from '../lib/firebase';\n", "");
code = code.replace("  const { user } = useAuth();\n  \n", "");
code = code.replace("originalPrice: product.originalPrice, horecaPrice: product.horecaPrice", "originalPrice: product.originalPrice");
code = code.replace("      horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : undefined\n    }))]", "    }))]");
code = code.replace("  const isHoreca = user?.role === 'horeca';\n  const currentPrice = isHoreca && currentVariant.horecaPrice ? currentVariant.horecaPrice : currentVariant.price;", "  const currentPrice = currentVariant.price;");
fs.writeFileSync('src/components/ProductCard.tsx', code);

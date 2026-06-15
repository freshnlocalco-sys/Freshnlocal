export const CATEGORIES = [
  'All Products',
  'Indian Fruits',
  'Exotic Fruits',
  'Exotic Vegetables',
  'Herbs & Seasoning',
  'Fresh & Hygenic Cut Fruits and Vegetables',
  'Imported / Super Exotic Vegetables',
  'Leafy Greens',
  'Frozen Items',
  'Mushrooms',
  'FNL Juices'
];

export const getCategoryImage = (category?: string, customMapping?: Record<string, string>, allowDefault: boolean = true) => {
  if (!category) return null;
  const normalizedCategory = category.toLowerCase().replace(/ font-bold/gi, '').trim();
  if (customMapping) {
    if (customMapping[normalizedCategory]) {
      return customMapping[normalizedCategory];
    }
    // Try matching singular and plural forms
    const singularKey = normalizedCategory.endsWith('s') ? normalizedCategory.slice(0, -1) : normalizedCategory;
    const pluralKey = normalizedCategory.endsWith('s') ? normalizedCategory : normalizedCategory + 's';
    if (customMapping[singularKey]) return customMapping[singularKey];
    if (customMapping[pluralKey]) return customMapping[pluralKey];
  }

  if (!allowDefault) return null;

  // High-quality default fallbacks so category images never appear broken
  const DEFAULT_CATEGORY_IMAGES: Record<string, string> = {
    'in season fruits': 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=600&auto=format&fit=crop&q=80',
    'in season fruit': 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=600&auto=format&fit=crop&q=80',
    'indian fruits': 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&auto=format&fit=crop&q=80',
    'indian fruit': 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&auto=format&fit=crop&q=80',
    'exotic fruits': 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=600&auto=format&fit=crop&q=80',
    'exotic fruit': 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=600&auto=format&fit=crop&q=80',
    'exotic vegetables': 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=600&auto=format&fit=crop&q=80',
    'exotic vegetable': 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=600&auto=format&fit=crop&q=80',
    'herbs & seasoning': 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
    'herb & seasoning': 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
    'fresh & hygenic cut fruits and vegetables': 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop&q=80',
    'fresh & hygenic cut fruit and vegetable': 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop&q=80',
    'clean cuts': 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop&q=80',
    'clean cut': 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop&q=80',
    'imported / super exotic vegetables': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
    'imported / super exotic vegetable': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
    'leafy greens': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
    'leafy green': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
    'frozen items': 'https://images.unsplash.com/photo-1498579809087-ef1e558fd1da?w=600&auto=format&fit=crop&q=80',
    'frozen item': 'https://images.unsplash.com/photo-1498579809087-ef1e558fd1da?w=600&auto=format&fit=crop&q=80',
    'frozen premium': 'https://images.unsplash.com/photo-1498579809087-ef1e558fd1da?w=600&auto=format&fit=crop&q=80',
    'mushrooms': 'https://images.unsplash.com/photo-1595855759920-86582396756a?w=600&auto=format&fit=crop&q=80',
    'mushroom': 'https://images.unsplash.com/photo-1595855759920-86582396756a?w=600&auto=format&fit=crop&q=80',
    'fnl juices': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&auto=format&fit=crop&q=80',
    'fnl juice': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&auto=format&fit=crop&q=80'
  };

  if (DEFAULT_CATEGORY_IMAGES[normalizedCategory]) {
    return DEFAULT_CATEGORY_IMAGES[normalizedCategory];
  }
  const singularKey = normalizedCategory.endsWith('s') ? normalizedCategory.slice(0, -1) : normalizedCategory;
  const pluralKey = normalizedCategory.endsWith('s') ? normalizedCategory : normalizedCategory + 's';
  if (DEFAULT_CATEGORY_IMAGES[singularKey]) return DEFAULT_CATEGORY_IMAGES[singularKey];
  if (DEFAULT_CATEGORY_IMAGES[pluralKey]) return DEFAULT_CATEGORY_IMAGES[pluralKey];

  return null;
};

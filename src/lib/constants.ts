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

export const getCategoryImage = (category?: string, customMapping?: Record<string, string>) => {
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
  return null;
};

export const CATEGORY_IMAGES: Record<string, string> = {
  'indian fruits': 'https://images.pexels.com/photos/264537/pexels-photo-264537.jpeg?auto=compress&cs=tinysrgb&w=800',
  'exotic fruits': 'https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=800',
  'exotic vegetables': 'https://images.pexels.com/photos/1435904/pexels-photo-1435904.jpeg?auto=compress&cs=tinysrgb&w=800',
  'herbs & seasoning': 'https://images.pexels.com/photos/4025801/pexels-photo-4025801.jpeg?auto=compress&cs=tinysrgb&w=800',
  'fresh & hygenic cut fruits and vegetables': 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800',
  'imported / super exotic vegetables': 'https://images.pexels.com/photos/2284166/pexels-photo-2284166.jpeg?auto=compress&cs=tinysrgb&w=800',
  'leafy greens': 'https://images.pexels.com/photos/1300975/pexels-photo-1300975.jpeg?auto=compress&cs=tinysrgb&w=800',
  'frozen items': 'https://images.pexels.com/photos/1293306/pexels-photo-1293306.jpeg?auto=compress&cs=tinysrgb&w=800',
  'all products': 'https://images.pexels.com/photos/1414651/pexels-photo-1414651.jpeg?auto=compress&cs=tinysrgb&w=800',
  'default': 'https://images.pexels.com/photos/1414651/pexels-photo-1414651.jpeg?auto=compress&cs=tinysrgb&w=800'
};

export const getCategoryImage = (category?: string) => {
  if (!category) return CATEGORY_IMAGES['default'];
  return CATEGORY_IMAGES[category.toLowerCase()] || CATEGORY_IMAGES['default'];
};

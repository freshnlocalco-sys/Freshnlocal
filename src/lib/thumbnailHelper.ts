import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Product } from '../store/useCart';

/**
 * Generates an optimized JPEG thumbnail from an image URL using canvas.
 * Correctly requests CORS. If CORS fails or loading errors out, it rejects gracefully.
 */
export function generateThumbnail(imageUrl: string, targetWidth: number = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!imageUrl) {
      reject(new Error("No image URL provided"));
      return;
    }
    
    // If it's already a base64 / data URL and it's short, use it.
    // If it's a huge base64, we can still shrink it.
    if (imageUrl.startsWith('data:') && imageUrl.length < 50000) {
      resolve(imageUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous"; // Try anonymous CORS request
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > targetWidth) {
          height = Math.round((height * targetWidth) / width);
          width = targetWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.88);
          resolve(base64);
        } else {
          reject(new Error("Failed to get 2D canvas context"));
        }
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => {
      reject(new Error("Failed to load image for web-thumbnail generation"));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Ensures a product has a thumbnailUrl. If not, generates one from imageUrl and updates
 * the local store, browser caches (localStorage & IndexedDB), and Firestore (if Admin).
 */
export async function ensureProductThumbnail(
  product: Product,
  onUpdateLocal: (updatedProduct: Product) => void,
  isAdminUser: boolean
): Promise<string | null> {
  // Due to rigorous user requirements to preserve 100% original quality and NOT compress or resize images,
  // we disable thumbnail generation completely and always use the original image URL.
  return product.thumbnailUrl || product.imageUrl || null;
}

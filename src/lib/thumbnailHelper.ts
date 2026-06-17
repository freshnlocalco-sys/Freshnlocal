import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Product } from '../store/useCart';

/**
 * Generates an optimized JPEG thumbnail from an image URL using canvas.
 * Correctly requests CORS. If CORS fails or loading errors out, it rejects gracefully.
 */
export function generateThumbnail(imageUrl: string, targetWidth: number = 250): Promise<string> {
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
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
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
  const needsThumbnail = !product.thumbnailUrl || product.thumbnailUrl === product.imageUrl;
  if (!needsThumbnail || !product.imageUrl) {
    return product.thumbnailUrl || null;
  }

  const startTime = performance.now();
  try {
    const thumbnailBase64 = await generateThumbnail(product.imageUrl, 220);
    const duration = performance.now() - startTime;
    console.log(
      `%c[PERF METRIC] Automatically generated thumbnail for "${product.name}" in ${duration.toFixed(2)}ms`,
      "color: #10b981; font-weight: bold; font-family: monospace;"
    );

    const updatedProduct = {
      ...product,
      thumbnailUrl: thumbnailBase64
    };

    // 1. Instantly trigger state update so UI is snappy
    onUpdateLocal(updatedProduct);

    // 2. Try Firestore updating (only if user is admin)
    if (isAdminUser) {
      try {
        await updateDoc(doc(db, 'products', product.id), {
          thumbnailUrl: thumbnailBase64
        });
        console.log(`Saved generated thumbnail for "${product.name}" to Firestore.`);
      } catch (fsErr) {
        console.warn(`Could not sync thumbnail for "${product.name}" to Firestore (expected if non-admin):`, fsErr);
      }
    }

    return thumbnailBase64;
  } catch (err) {
    // If generation fails (CORS, network error, etc.), gracefully tag it so we don't repeat generation attempts
    console.debug(`Could not generate thumbnail for "${product.name}":`, err);
    
    // Mark the thumbnail equal to imageUrl temporarily in local state/cache to bypass endless regeneration loops
    const updatedProduct = {
      ...product,
      thumbnailUrl: product.imageUrl // fallback to full size
    };
    onUpdateLocal(updatedProduct);
    return null;
  }
}

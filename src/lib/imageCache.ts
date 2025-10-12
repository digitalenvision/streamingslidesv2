/**
 * Image Cache System using IndexedDB
 * Stores images locally to avoid repeated ImageKit API calls
 */

const DB_NAME = 'streaming-slides-cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const METADATA_STORE = 'metadata';

interface CachedImage {
  url: string;
  blob: Blob;
  timestamp: number;
  originalSize: number;
  compressedSize: number;
}

interface CacheMetadata {
  totalSize: number;
  imageCount: number;
  lastUpdated: number;
}

class ImageCacheManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create images store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const imageStore = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          imageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Compress image using Canvas API (lossless PNG)
   */
  private async compressImage(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve(blob); // Fallback to original
            return;
          }

          // Set canvas size to image size
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw image
          ctx.drawImage(img, 0, 0);

          // Convert to blob with lossless PNG
          canvas.toBlob(
            (compressedBlob) => {
              URL.revokeObjectURL(url);
              if (compressedBlob && compressedBlob.size < blob.size) {
                resolve(compressedBlob);
              } else {
                resolve(blob); // Use original if compression didn't help
              }
            },
            'image/png',
            1.0 // Maximum quality
          );
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /**
   * Check if image is cached
   */
  async isCached(url: string): Promise<boolean> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cached image
   */
  async get(url: string): Promise<string | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedImage | undefined;
        if (result) {
          const objectUrl = URL.createObjectURL(result.blob);
          resolve(objectUrl);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cache an image from URL
   */
  async cacheImage(url: string): Promise<string> {
    await this.init();

    // Check if already cached
    const cached = await this.get(url);
    if (cached) {
      return cached;
    }

    // Fetch image
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const originalBlob = await response.blob();
    const originalSize = originalBlob.size;

    // Compress image (only for images, not videos)
    let finalBlob = originalBlob;
    if (originalBlob.type.startsWith('image/')) {
      try {
        finalBlob = await this.compressImage(originalBlob);
      } catch (error) {
        console.warn('Image compression failed, using original:', error);
        finalBlob = originalBlob;
      }
    }

    const compressedSize = finalBlob.size;

    // Store in IndexedDB
    const cachedImage: CachedImage = {
      url,
      blob: finalBlob,
      timestamp: Date.now(),
      originalSize,
      compressedSize,
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(cachedImage);

      request.onsuccess = async () => {
        await this.updateMetadata();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    // Return object URL
    return URL.createObjectURL(finalBlob);
  }

  /**
   * Cache multiple images
   */
  async cacheImages(urls: string[], onProgress?: (current: number, total: number) => void): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    for (let i = 0; i < urls.length; i++) {
      try {
        const objectUrl = await this.cacheImage(urls[i]);
        results.set(urls[i], objectUrl);
        onProgress?.(i + 1, urls.length);
      } catch (error) {
        console.error(`Failed to cache image ${urls[i]}:`, error);
      }
    }

    return results;
  }

  /**
   * Get or cache image
   */
  async getOrCache(url: string): Promise<string> {
    const cached = await this.get(url);
    if (cached) {
      return cached;
    }
    return this.cacheImage(url);
  }

  /**
   * Update cache metadata
   */
  private async updateMetadata(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
      const imageStore = transaction.objectStore(STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE);
      
      const request = imageStore.getAll();

      request.onsuccess = () => {
        const images = request.result as CachedImage[];
        const totalSize = images.reduce((sum, img) => sum + img.compressedSize, 0);
        
        const metadata: CacheMetadata = {
          totalSize,
          imageCount: images.length,
          lastUpdated: Date.now(),
        };

        metadataStore.put({ id: 'main', ...metadata });
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cache metadata
   */
  async getMetadata(): Promise<CacheMetadata> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get('main');

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            totalSize: result.totalSize,
            imageCount: result.imageCount,
            lastUpdated: result.lastUpdated,
          });
        } else {
          resolve({
            totalSize: 0,
            imageCount: 0,
            lastUpdated: Date.now(),
          });
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all cached image URLs
   */
  async getAllCachedUrls(): Promise<string[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all cached images
   */
  async clear(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
      const imageStore = transaction.objectStore(STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      const clearImages = imageStore.clear();
      const clearMetadata = metadataStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Remove specific image from cache
   */
  async remove(url: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(url);

      request.onsuccess = async () => {
        await this.updateMetadata();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalSize: number;
    imageCount: number;
    formattedSize: string;
    compressionRatio: number;
  }> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const images = request.result as CachedImage[];
        const totalOriginalSize = images.reduce((sum, img) => sum + img.originalSize, 0);
        const totalCompressedSize = images.reduce((sum, img) => sum + img.compressedSize, 0);
        
        const compressionRatio = totalOriginalSize > 0 
          ? ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100
          : 0;

        resolve({
          totalSize: totalCompressedSize,
          imageCount: images.length,
          formattedSize: this.formatBytes(totalCompressedSize),
          compressionRatio,
        });
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Preload images for a slideshow
   */
  async preloadSlideshow(items: Array<{ content: { url: string } }>): Promise<void> {
    const urls = items.map(item => item.content.url);
    await this.cacheImages(urls);
  }
}

// Export singleton instance
export const imageCache = new ImageCacheManager();

// Helper functions
export const getCachedImage = (url: string) => imageCache.getOrCache(url);
export const preloadImages = (urls: string[]) => imageCache.cacheImages(urls);
export const clearImageCache = () => imageCache.clear();
export const getImageCacheStats = () => imageCache.getStats();


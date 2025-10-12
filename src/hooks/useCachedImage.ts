import { useState, useEffect } from 'react';
import { imageCache } from '@/lib/imageCache';

/**
 * Hook to get cached image URL
 * Automatically fetches and caches image if not already cached
 */
export function useCachedImage(url: string | undefined): {
  cachedUrl: string | null;
  loading: boolean;
  error: Error | null;
} {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setCachedUrl(null);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(null);
        const cached = await imageCache.getOrCache(url);
        
        if (isMounted) {
          setCachedUrl(cached);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
          setCachedUrl(url); // Fallback to original URL
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [url]);

  return { cachedUrl, loading, error };
}

/**
 * Hook to preload multiple images
 */
export function usePreloadImages(urls: string[]): {
  progress: number;
  loading: boolean;
  error: Error | null;
} {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (urls.length === 0) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const preload = async () => {
      try {
        setLoading(true);
        setError(null);
        
        await imageCache.cacheImages(urls, (current, total) => {
          if (isMounted) {
            setProgress((current / total) * 100);
          }
        });
        
        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
    };

    preload();

    return () => {
      isMounted = false;
    };
  }, [urls.join(',')]); // Use join for stable dependency

  return { progress, loading, error };
}


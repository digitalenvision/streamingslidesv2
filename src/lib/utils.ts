import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { TransitionSpeed, TransitionType } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
}

export function getTransitionDuration(speed: TransitionSpeed): number {
  switch (speed) {
    case 'slow':
      return 1.5;
    case 'medium':
      return 0.8;
    case 'fast':
      return 0.4;
    default:
      return 0.8;
  }
}

export function getTransitionVariants(
  type: TransitionType,
  speed: TransitionSpeed
) {
  const duration = getTransitionDuration(speed);

  switch (type) {
    case 'fade':
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration },
      };
    case 'slide-left':
      return {
        initial: { x: '100%', opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: '-100%', opacity: 0 },
        transition: { duration },
      };
    case 'slide-right':
      return {
        initial: { x: '-100%', opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: '100%', opacity: 0 },
        transition: { duration },
      };
    case 'slide-up':
      return {
        initial: { y: '100%', opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '-100%', opacity: 0 },
        transition: { duration },
      };
    case 'slide-down':
      return {
        initial: { y: '-100%', opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0 },
        transition: { duration },
      };
    case 'zoom':
      return {
        initial: { scale: 0.8, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 1.2, opacity: 0 },
        transition: { duration },
      };
    case 'dissolve':
      return {
        initial: { opacity: 0, scale: 1.05 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration },
      };
    case 'none':
    default:
      return {
        initial: {},
        animate: {},
        exit: {},
        transition: { duration: 0 },
      };
  }
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getImageKitUrl(
  url: string,
  transformations?: {
    width?: number;
    height?: number;
    quality?: number;
    blur?: number;
  }
): string {
  if (!transformations) return url;

  const params: string[] = [];
  
  if (transformations.width) params.push(`w-${transformations.width}`);
  if (transformations.height) params.push(`h-${transformations.height}`);
  if (transformations.quality) params.push(`q-${transformations.quality}`);
  if (transformations.blur) params.push(`bl-${transformations.blur}`);

  if (params.length === 0) return url;

  // Insert transformations before the filename in ImageKit URL
  const urlParts = url.split('/');
  const filename = urlParts.pop();
  const transformation = `tr:${params.join(',')}`;
  
  return `${urlParts.join('/')}/${transformation}/${filename}`;
}

export function generateShareUrl(slideshowId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/preview/${slideshowId}`;
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function getRandomItem<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

export function calculateTotalDuration(
  items: { content: any }[],
  defaultDuration: number = 5
): number {
  return items.reduce((total, item) => {
    if (item.content.duration) {
      return total + item.content.duration;
    }
    return total + defaultDuration;
  }, 0);
}

export function isVideo(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
}

export function isImage(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  return imageExtensions.some(ext => url.toLowerCase().includes(ext));
}


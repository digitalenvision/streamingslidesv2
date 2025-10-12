import ImageKit from 'imagekit-javascript';
import { supabase } from './supabase';
import type { ImageKitAuthParams, ImageKitUploadResponse } from '@/types';

const publicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;
const urlEndpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT;

if (!publicKey || !urlEndpoint) {
  throw new Error('Missing ImageKit environment variables');
}

// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey,
  urlEndpoint,
});

/**
 * Get authentication parameters from Supabase Edge Function
 */
export async function getImageKitAuthParams(): Promise<ImageKitAuthParams> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imagekit-auth`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get ImageKit auth params');
  }

  return response.json();
}

/**
 * Sanitize folder name for ImageKit
 */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim();
}

/**
 * Upload a file to ImageKit
 */
export async function uploadToImageKit(
  file: File,
  folder: string = 'slideshows'
): Promise<ImageKitUploadResponse> {
  const authParams = await getImageKitAuthParams();

  return new Promise((resolve, reject) => {
    imagekit.upload(
      {
        file,
        fileName: file.name,
        folder,
        signature: authParams.signature,
        expire: authParams.expire,
        token: authParams.token,
        useUniqueFileName: true,
      },
      (err, result) => {
        if (err) {
          reject(err);
        } else if (result) {
          resolve(result as ImageKitUploadResponse);
        } else {
          reject(new Error('Upload failed'));
        }
      }
    );
  });
}

/**
 * Generate folder path: userId/slideshowName/streamName
 */
export function generateFolderPath(
  userId: string,
  slideshowName: string,
  streamName: string
): string {
  const sanitizedSlideshow = sanitizeFolderName(slideshowName);
  const sanitizedStream = sanitizeFolderName(streamName);
  
  return `${userId}/${sanitizedSlideshow}/${sanitizedStream}`;
}

/**
 * Extract fileId from ImageKit URL or path
 */
export function extractFileId(urlOrPath: string): string | null {
  if (!urlOrPath) return null;
  
  // If it's a full URL, extract the filename
  if (urlOrPath.includes('imagekit.io')) {
    const url = new URL(urlOrPath);
    const pathname = url.pathname;
    const parts = pathname.split('/');
    // Get the last part (filename with extension)
    return parts[parts.length - 1];
  }
  
  // If it's already a path, just get the filename
  const parts = urlOrPath.split('/');
  return parts[parts.length - 1];
}

/**
 * Delete a file from ImageKit
 * @param fileIdOrUrl - Can be a fileId, storage_path, or full URL
 */
export async function deleteFromImageKit(fileIdOrUrl: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Extract fileId if a URL or path was provided
  const fileId = extractFileId(fileIdOrUrl);
  
  if (!fileId) {
    console.warn('Could not extract fileId from:', fileIdOrUrl);
    return;
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imagekit-delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete file from ImageKit: ${errorText}`);
  }
}

/**
 * Get ImageKit URL with transformations
 */
export function getTransformedUrl(
  url: string,
  transformations: {
    width?: number;
    height?: number;
    quality?: number;
    blur?: number;
    aspectRatio?: string;
    crop?: string;
    focus?: string;
  } = {}
): string {
  const params: string[] = [];

  if (transformations.width) params.push(`w-${transformations.width}`);
  if (transformations.height) params.push(`h-${transformations.height}`);
  if (transformations.quality) params.push(`q-${transformations.quality}`);
  if (transformations.blur) params.push(`bl-${transformations.blur}`);
  if (transformations.aspectRatio) params.push(`ar-${transformations.aspectRatio}`);
  if (transformations.crop) params.push(`c-${transformations.crop}`);
  if (transformations.focus) params.push(`fo-${transformations.focus}`);

  if (params.length === 0) return url;

  // ImageKit transformation syntax
  const transformation = `tr:${params.join(',')}`;
  
  // Insert transformation into URL
  const urlParts = url.split('/');
  const lastPart = urlParts[urlParts.length - 1];
  
  // Check if there's already a transformation
  if (lastPart.startsWith('tr:')) {
    urlParts[urlParts.length - 1] = transformation;
    return urlParts.join('/');
  }
  
  // Add transformation before the last segment
  urlParts.splice(urlParts.length - 1, 0, transformation);
  return urlParts.join('/');
}

/**
 * Generate thumbnail URL
 */
export function getThumbnailUrl(url: string, size: number = 300): string {
  return getTransformedUrl(url, {
    width: size,
    height: size,
    crop: 'at_max',
    quality: 80,
  });
}

/**
 * Generate preview URL
 */
export function getPreviewUrl(url: string, width: number = 1920): string {
  return getTransformedUrl(url, {
    width,
    quality: 90,
  });
}


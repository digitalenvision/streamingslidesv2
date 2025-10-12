import { supabase } from '@/lib/supabase';
import type { Album, PhotoRecord } from '@/types';

/**
 * Get all albums for current user
 */
export async function getAlbums(): Promise<Album[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get a single album by ID
 */
export async function getAlbum(id: string): Promise<Album | null> {
  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Create a new album
 */
export async function createAlbum(name: string): Promise<Album> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('albums')
    .insert({
      user_id: user.id,
      name,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update an album
 */
export async function updateAlbum(
  id: string,
  name: string
): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete an album
 */
export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabase
    .from('albums')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
}

/**
 * Add photos to album
 */
export async function addPhotosToAlbum(
  albumId: string,
  photoIds: string[]
): Promise<void> {
  const { error } = await supabase
    .from('photos')
    .update({ album_id: albumId })
    .in('id', photoIds);

  if (error) {
    throw error;
  }
}

/**
 * Remove photos from album
 */
export async function removePhotosFromAlbum(photoIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('photos')
    .update({ album_id: null })
    .in('id', photoIds);

  if (error) {
    throw error;
  }
}

/**
 * Get photos in an album
 */
export async function getAlbumPhotos(albumId: string): Promise<PhotoRecord[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('album_id', albumId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Create album from selected photos
 */
export async function createAlbumFromPhotos(
  name: string,
  photoIds: string[]
): Promise<Album> {
  const album = await createAlbum(name);
  await addPhotosToAlbum(album.id, photoIds);
  return album;
}


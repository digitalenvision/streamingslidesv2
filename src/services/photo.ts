import { supabase } from '@/lib/supabase';
import { uploadToImageKit, deleteFromImageKit, getThumbnailUrl, generateFolderPath } from '@/lib/imagekit';
import type { StreamItem, Photo, Video, PhotoRecord } from '@/types';

/**
 * Get all items in a stream
 */
export async function getStreamItems(streamId: string): Promise<StreamItem[]> {
  const { data, error } = await supabase
    .from('stream_items')
    .select('*')
    .eq('stream_id', streamId)
    .order('order', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Create a stream item
 */
export async function createStreamItem(
  streamId: string,
  type: 'photo' | 'video',
  content: Photo | Video
): Promise<StreamItem> {
  // Get current max order
  const { data: existingItems } = await supabase
    .from('stream_items')
    .select('order')
    .eq('stream_id', streamId)
    .order('order', { ascending: false })
    .limit(1);

  const nextOrder = existingItems && existingItems.length > 0
    ? existingItems[0].order + 1
    : 0;

  const { data, error } = await supabase
    .from('stream_items')
    .insert({
      stream_id: streamId,
      type,
      content,
      order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Upload photo/video to ImageKit and create stream item
 */
export async function uploadMedia(
  file: File,
  streamId: string
): Promise<StreamItem> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Fetch stream and slideshow info for proper folder structure
  const { data: stream, error: streamError } = await supabase
    .from('streams')
    .select('title, slideshow_id, slideshows(title)')
    .eq('id', streamId)
    .single();

  if (streamError || !stream) {
    throw new Error('Stream not found');
  }

  const slideshowTitle = (stream.slideshows as any)?.title || 'Untitled Slideshow';
  const streamTitle = stream.title;

  // Generate folder path: userId/slideshowName/streamName
  const folder = generateFolderPath(user.id, slideshowTitle, streamTitle);

  // Upload to ImageKit
  const uploadResult = await uploadToImageKit(file, folder);

  // Determine type
  const isVideo = file.type.startsWith('video/');
  const type = isVideo ? 'video' : 'photo';

  // Create content object
  const content: Photo | Video = {
    url: uploadResult.url,
    source: 'upload',
    storage_path: uploadResult.filePath,
    thumbnail_url: uploadResult.thumbnailUrl || getThumbnailUrl(uploadResult.url),
  };

  // For videos, we might want to add duration later
  if (isVideo) {
    // Duration can be extracted from video metadata if needed
  }

  // Save to photos table for later reference
  await supabase
    .from('photos')
    .insert({
      user_id: user.id,
      url: uploadResult.url,
      source: 'upload',
      storage_path: uploadResult.filePath,
    });

  // Create stream item
  return createStreamItem(streamId, type, content);
}

/**
 * Delete a stream item
 */
export async function deleteStreamItem(id: string): Promise<void> {
  // Get item to extract storage info
  const { data: item, error: fetchError } = await supabase
    .from('stream_items')
    .select('content')
    .eq('id', id)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  // Delete from database first
  const { error: deleteError } = await supabase
    .from('stream_items')
    .delete()
    .eq('id', id);

  if (deleteError) {
    throw deleteError;
  }

  // Delete from ImageKit if storage_path or URL exists
  const fileToDelete = item?.content?.storage_path || item?.content?.url;
  if (fileToDelete) {
    try {
      await deleteFromImageKit(fileToDelete);
      console.log(`Deleted file from ImageKit`);
    } catch (err) {
      // Log error but don't fail the deletion if ImageKit deletion fails
      console.error('Failed to delete from ImageKit:', err);
    }
  }
}

/**
 * Reorder stream items
 */
export async function reorderStreamItems(
  streamId: string,
  itemIds: string[]
): Promise<void> {
  const updates = itemIds.map((id, index) => ({
    id,
    order: index,
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('stream_items')
      .update({ order: update.order, updated_at: update.updated_at })
      .eq('id', update.id)
      .eq('stream_id', streamId);

    if (error) {
      throw error;
    }
  }
}

/**
 * Update stream item content
 */
export async function updateStreamItem(
  id: string,
  content: Partial<Photo | Video>
): Promise<StreamItem> {
  // Get current item
  const { data: currentItem } = await supabase
    .from('stream_items')
    .select('content')
    .eq('id', id)
    .single();

  if (!currentItem) {
    throw new Error('Stream item not found');
  }

  const updatedContent = {
    ...currentItem.content,
    ...content,
  };

  const { data, error } = await supabase
    .from('stream_items')
    .update({
      content: updatedContent,
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
 * Get all photos for current user
 */
export async function getUserPhotos(albumId?: string): Promise<PhotoRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('photos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (albumId) {
    query = query.eq('album_id', albumId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Delete multiple stream items
 */
export async function deleteMultipleStreamItems(ids: string[]): Promise<void> {
  // First, get all items to extract their storage paths
  const { data: items, error: fetchError } = await supabase
    .from('stream_items')
    .select('id, content')
    .in('id', ids);

  if (fetchError) {
    throw fetchError;
  }

  // Delete from database
  const { error: deleteError } = await supabase
    .from('stream_items')
    .delete()
    .in('id', ids);

  if (deleteError) {
    throw deleteError;
  }

  // Delete from ImageKit for each item
  if (items && items.length > 0) {
    const deletePromises = items.map(async (item) => {
      const fileToDelete = item.content?.storage_path || item.content?.url;
      if (fileToDelete) {
        try {
          await deleteFromImageKit(fileToDelete);
          console.log(`Deleted file from ImageKit`);
        } catch (err) {
          console.error(`Failed to delete file from ImageKit:`, err);
        }
      }
    });

    // Execute all deletions in parallel (don't wait for them)
    Promise.allSettled(deletePromises);
  }
}


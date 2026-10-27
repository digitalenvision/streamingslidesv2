// Read-only data access for the legacy /preview/:id player, kept so TVs still pointed
// at the old slideshows keep playing while they're moved to /play/:screenId.
import { supabase } from '@/lib/supabase';
import type { Slideshow, StreamWithItems } from './types';

export async function getSlideshow(id: string): Promise<Slideshow | null> {
  const { data, error } = await supabase.from('slideshows').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getStreams(slideshowId: string): Promise<StreamWithItems[]> {
  const { data, error } = await supabase
    .from('streams')
    .select('*, stream_items (*)')
    .eq('slideshow_id', slideshowId)
    .order('order', { ascending: true });
  if (error) throw error;
  return (data || []).map((stream: any) => ({
    ...stream,
    items: (stream.stream_items || []).sort((a: any, b: any) => a.order - b.order),
  }));
}

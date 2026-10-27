// Rows of the Gusto media tables (supabase/migrations/*_gusto_media.sql).

export type AlbumStatus = 'draft' | 'published';
export type ScreenMode = 'auto' | 'pinned' | 'hidden';
export type ImageFormat = 'webp' | 'jpg';

export interface Album {
  id: string;
  slug: string;
  title: string;
  event_date: string; // YYYY-MM-DD
  description: string | null;
  fourvenues_code: string | null;
  cover_photo_id: string | null;
  status: AlbumStatus;
  show_on_web: boolean;
  screen_mode: ScreenMode;
  photo_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  album_id: string;
  position: number;
  width: number;
  height: number;
  format: ImageFormat;
  lqip: string | null;
  original_name: string | null;
  taken_at: string | null;
  hidden_web: boolean;
  hidden_screen: boolean;
  created_at: string;
}

export interface Promo {
  id: string;
  title: string;
  kind: 'image' | 'video';
  path: string;
  width: number | null;
  height: number | null;
  duration_seconds: number;
  every_n: number;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  position: number;
  screen_ids: string[] | null;
  created_at: string;
}

export type Transition = 'fade' | 'slide' | 'zoom' | 'none';

export interface Screen {
  id: string;
  name: string;
  max_albums: number;
  max_days: number;
  photo_seconds: number;
  transition: Transition;
  shuffle: boolean;
  show_album_titles: boolean;
  legacy_slideshow_id: string | null;
  content_version: number;
  updated_at: string;
}

export interface Visitor {
  id: string;
  email: string;
  marketing_opt_in: boolean;
  first_album_id: string | null;
  downloads: number;
  created_at: string;
  last_seen_at: string;
}

export interface RemovalRequest {
  id: string;
  photo_id: string | null;
  album_id: string | null;
  email: string;
  reason: string | null;
  status: 'open' | 'done' | 'rejected';
  created_at: string;
}

/** What `screen_playlist(screen_id)` returns. */
export interface Playlist {
  screen: Omit<Screen, 'updated_at'>;
  albums: { id: string; title: string; event_date: string; photos: { id: string; w: number; h: number; f: ImageFormat }[] }[];
  promos: { id: string; title: string; kind: 'image' | 'video'; path: string; w: number | null; h: number | null; duration_seconds: number; every_n: number }[];
}

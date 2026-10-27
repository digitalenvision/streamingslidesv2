// Database Types
export interface User {
  id: string;
  email?: string;
  created_at?: string;
}

export interface Slideshow {
  id: string;
  user_id: string;
  title: string;
  settings: SlideshowSettings;
  created_at: string;
  updated_at: string;
}

export interface SlideshowSettings {
  background: {
    type: 'color' | 'image';
    color?: string;
    imageUrl?: string;
    blur?: number;
    overlayColor?: string;
    overlayOpacity?: number;
  };
  loop: boolean;
  margin: number; // percentage
  shuffle: boolean;
  duration?: number; // default duration for items
  transition?: TransitionType;
  transitionSpeed?: TransitionSpeed;
}

export type TransitionType = 
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom'
  | 'dissolve';

export type TransitionSpeed = 'slow' | 'medium' | 'fast';

export interface Stream {
  id: string;
  slideshow_id: string;
  type: 'slideshow' | 'single-photo' | 'video';
  title: string;
  order: number;
  settings: StreamSettings | null;
  created_at: string;
  updated_at: string;
}

export interface StreamSettings {
  duration?: number; // seconds per item
  transition?: TransitionType;
  transitionSpeed?: TransitionSpeed;
  frequency?: number; // for single-photo and video: show after every X slides
}

export interface StreamItem {
  id: string;
  stream_id: string;
  type: 'photo' | 'video' | 'custom';
  content: Photo | Video | CustomContent;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  url: string;
  source: 'upload' | 'dropbox' | 'gdrive';
  storage_path?: string;
  overlay?: Overlay;
  thumbnail_url?: string;
}

export interface Video {
  url: string;
  source: 'upload' | 'dropbox' | 'gdrive';
  storage_path?: string;
  thumbnail_url?: string;
  duration?: number;
}

export interface CustomContent {
  type: string;
  data: Record<string, any>;
}

export interface Overlay {
  text: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  color: string;
  opacity: number;
}

export interface Album {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface PhotoRecord {
  id: string;
  user_id: string;
  url: string;
  source: 'upload' | 'dropbox' | 'gdrive';
  storage_path?: string;
  overlay?: Overlay;
  created_at: string;
  album_id?: string;
}

export interface SlideshowCommand {
  id: string;
  slideshow_id: string;
  command: 'next' | 'previous' | 'play' | 'pause' | 'reload' | 'black-screen' | 'show-screen';
  payload?: Record<string, any>;
  timestamp: string;
  created_at: string;
}

// UI Types
export interface SlideshowWithStats extends Slideshow {
  stream_count: number;
  total_duration: number;
  thumbnail_url?: string;
}

export interface StreamWithItems extends Stream {
  items: StreamItem[];
}

// Preview State Types
export interface PreviewState {
  currentStreamIndex: number;
  currentItemIndex: number;
  isPlaying: boolean;
  isBlackScreen: boolean;
  isFullscreen: boolean;
}

export interface PreviewStatus {
  slideshow_id: string;
  is_playing: boolean;
  is_black_screen: boolean;
  current_stream_index: number;
  current_item_index: number;
  timestamp: number;
}

// ImageKit Types
export interface ImageKitAuthParams {
  signature: string;
  expire: number;
  token: string;
}

export interface ImageKitUploadResponse {
  fileId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  height?: number;
  width?: number;
  size: number;
  filePath: string;
  fileType: string;
}

// Form Types
export interface CreateSlideshowForm {
  title: string;
}

export interface CreateStreamForm {
  title: string;
  type: 'slideshow' | 'single-photo' | 'video';
}

export interface CreateAlbumForm {
  name: string;
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};


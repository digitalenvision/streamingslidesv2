import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Trash2, Image as ImageIcon, Video as VideoIcon, GripVertical } from 'lucide-react';
import type { StreamItem } from '@/types';
import { isVideo } from '@/lib/utils';
import { useCachedImage } from '@/hooks/useCachedImage';

function MediaThumbnail({ url }: { url: string }) {
  const { cachedUrl, loading } = useCachedImage(url);
  
  if (loading || !cachedUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted">
        <ImageIcon className="w-8 h-8 text-muted-foreground animate-pulse" />
      </div>
    );
  }
  
  return (
    <img
      src={cachedUrl}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
    />
  );
}

function PreviewModal({ item, onClose }: { item: StreamItem; onClose: () => void }) {
  const itemContent = item.content as any;
  const { cachedUrl } = useCachedImage(itemContent.url);
  const displayUrl = cachedUrl || itemContent.url;
  
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="xl"
      title="Preview"
    >
      <div className="flex items-center justify-center">
        {isVideo(itemContent.url) ? (
          <video
            src={displayUrl}
            controls
            className="max-w-full max-h-[70vh]"
          />
        ) : (
          <img
            src={displayUrl}
            alt=""
            className="max-w-full max-h-[70vh] object-contain"
          />
        )}
      </div>
    </Modal>
  );
}

interface PhotoListProps {
  items: StreamItem[];
  selectedItems: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: (id: string) => void;
  onDeleteSelected: () => void;
  dragHandleProps?: (id: string) => any;
}

export function PhotoList({
  items,
  selectedItems,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onDeleteSelected,
  dragHandleProps,
}: PhotoListProps) {
  const [previewItem, setPreviewItem] = useState<StreamItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const allSelected = items.length > 0 && selectedItems.length === items.length;

  return (
    <>
      {/* Selection Header */}
      {items.length > 0 && (
        <div className="flex items-center justify-between mb-4 p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allSelected}
              onChange={() => allSelected ? onDeselectAll() : onSelectAll()}
              label={`${selectedItems.length} selected`}
            />
          </div>
          {selectedItems.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onDeleteSelected}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected
            </Button>
          )}
        </div>
      )}

      {/* Items Grid */}
      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No items yet. Upload some photos or videos to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="relative group aspect-square bg-muted rounded-lg overflow-hidden"
            >
              {/* Drag Handle */}
              {dragHandleProps && (
                <div
                  {...dragHandleProps(item.id)}
                  className="absolute top-2 left-2 z-10 bg-background/80 p-1 rounded cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
              )}

              {/* Selection Checkbox */}
              <div className="absolute top-2 right-2 z-10">
                <Checkbox
                  checked={selectedItems.includes(item.id)}
                  onChange={() => onToggleSelect(item.id)}
                />
              </div>

              {/* Media */}
              <div
                className="w-full h-full cursor-pointer"
                onClick={() => setPreviewItem(item)}
              >
                {isVideo((item.content as any).url) ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <VideoIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                ) : (
                  <MediaThumbnail url={(item.content as any).thumbnail_url || (item.content as any).url} />
                )}
              </div>

              {/* Actions Overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(item.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmId(null)}
          title="Delete Item"
          description="Are you sure you want to delete this item?"
        >
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(deleteConfirmId);
                setDeleteConfirmId(null);
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}


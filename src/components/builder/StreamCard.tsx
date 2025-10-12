import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Edit, Trash2, Settings as SettingsIcon, GripVertical } from 'lucide-react';
import type { StreamWithItems } from '@/types';

interface StreamCardProps {
  stream: StreamWithItems;
  slideshowId: string;
  onDelete: (id: string) => void;
  dragHandleProps?: any;
}

export function StreamCard({ stream, slideshowId, onDelete, dragHandleProps }: StreamCardProps) {
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDelete = () => {
    onDelete(stream.id);
    setShowDeleteModal(false);
  };

  const getStreamTypeLabel = (type: string) => {
    switch (type) {
      case 'slideshow':
        return 'Photo Stream';
      case 'single-photo':
        return 'Single Photo';
      case 'video':
        return 'Video';
      default:
        return type;
    }
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {/* Drag Handle */}
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="w-5 h-5 text-muted-foreground" />
            </div>

            {/* Thumbnail */}
            <div className="w-20 h-20 bg-muted rounded flex-shrink-0">
              {stream.items.length > 0 && stream.items[0].content.url ? (
                <img
                  src={stream.items[0].content.thumbnail_url || stream.items[0].content.url}
                  alt={stream.title}
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No media
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{stream.title}</h3>
              <p className="text-sm text-muted-foreground">
                {getStreamTypeLabel(stream.type)} • {stream.items.length} items
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/builder/${slideshowId}/stream/${stream.id}/edit`)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/builder/${slideshowId}/stream/${stream.id}/settings`)}
              >
                <SettingsIcon className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Stream"
        description="Are you sure you want to delete this stream? This action cannot be undone."
      >
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}


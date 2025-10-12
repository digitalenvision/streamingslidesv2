import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Play, Edit, Share2, Trash2, MoreVertical } from 'lucide-react';
import { formatDuration, generateShareUrl, copyToClipboard } from '@/lib/utils';
import type { SlideshowWithStats } from '@/types';
import { Alert } from '@/components/ui/Alert';
import { useCachedImage } from '@/hooks/useCachedImage';

interface SlideshowCardProps {
  slideshow: SlideshowWithStats;
  onDelete: (id: string) => void;
}

export function SlideshowCard({ slideshow, onDelete }: SlideshowCardProps) {
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const { cachedUrl: thumbnailUrl } = useCachedImage(slideshow.thumbnail_url);

  const shareUrl = generateShareUrl(slideshow.id);
  const displayThumbnail = thumbnailUrl || slideshow.thumbnail_url;

  const handleShare = async () => {
    try {
      await copyToClipboard(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDelete = () => {
    onDelete(slideshow.id);
    setShowDeleteModal(false);
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        {/* Thumbnail */}
        <div className="aspect-video bg-muted relative group">
          {displayThumbnail ? (
            <img
              src={displayThumbnail}
              alt={slideshow.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold text-lg mb-2 truncate">{slideshow.title}</h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{slideshow.stream_count} streams</span>
            <span>{formatDuration(slideshow.total_duration)}</span>
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-0 flex gap-2">
          <Button
            size="sm"
            onClick={() => navigate(`/preview/${slideshow.id}`)}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/builder/${slideshow.id}`)}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowShareModal(true)}
          >
            <Share2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDeleteModal(true)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Slideshow"
        description="Are you sure you want to delete this slideshow? This action cannot be undone."
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

      {/* Share Modal */}
      <Modal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title="Share Slideshow"
        description="Share this link to allow others to view your slideshow."
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-3 py-2 border rounded-md bg-muted"
            />
            <Button onClick={handleShare}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          {copied && (
            <Alert variant="success">
              Link copied to clipboard!
            </Alert>
          )}
        </div>
      </Modal>
    </>
  );
}


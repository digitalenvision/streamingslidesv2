import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { PhotoUploader } from '@/components/stream/PhotoUploader';
import { PhotoList } from '@/components/stream/PhotoList';
import { CreateAlbumModal } from '@/components/stream/CreateAlbumModal';
import { ArrowLeft, FolderPlus, Settings } from 'lucide-react';
import { getStream } from '@/services/stream';
import { getStreamItems, deleteStreamItem, deleteMultipleStreamItems, reorderStreamItems } from '@/services/photo';
import { createAlbumFromPhotos } from '@/services/album';
import type { StreamWithItems, StreamItem } from '@/types';

export function StreamEdit() {
  const { id: slideshowId, streamId } = useParams<{ id: string; streamId: string }>();
  const navigate = useNavigate();
  const [stream, setStream] = useState<StreamWithItems | null>(null);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);

  useEffect(() => {
    if (streamId) {
      loadData();
    }
  }, [streamId]);

  const loadData = async () => {
    if (!streamId) return;

    try {
      setLoading(true);
      setError(null);
      const [streamData, itemsData] = await Promise.all([
        getStream(streamId),
        getStreamItems(streamId),
      ]);
      setStream(streamData);
      setItems(itemsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedItems(items.map(item => item.id));
  };

  const handleDeselectAll = () => {
    setSelectedItems([]);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStreamItem(id);
      setItems(items.filter(item => item.id !== id));
      setSelectedItems(selectedItems.filter(i => i !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
    }
  };

  const handleDeleteSelected = async () => {
    try {
      await deleteMultipleStreamItems(selectedItems);
      setItems(items.filter(item => !selectedItems.includes(item.id)));
      setSelectedItems([]);
    } catch (err: any) {
      setError(err.message || 'Failed to delete items');
    }
  };

  const handleCreateAlbum = async (name: string) => {
    try {
      await createAlbumFromPhotos(name, selectedItems);
      setSelectedItems([]);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to create album');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </Layout>
    );
  }

  if (!stream) {
    return (
      <Layout>
        <Alert variant="destructive">Stream not found</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title={stream.title}
        description="Manage content for this stream"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/builder/${slideshowId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Builder
            </Button>
            {selectedItems.length > 0 && (
              <Button variant="outline" onClick={() => setShowCreateAlbumModal(true)}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Create Album
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(`/builder/${slideshowId}/stream/${streamId}/settings`)}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      <div className="space-y-6">
        <PhotoUploader streamId={streamId!} onUploadComplete={loadData} />

        <PhotoList
          items={items}
          selectedItems={selectedItems}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDelete={handleDelete}
          onDeleteSelected={handleDeleteSelected}
        />
      </div>

      <CreateAlbumModal
        isOpen={showCreateAlbumModal}
        onClose={() => setShowCreateAlbumModal(false)}
        onCreate={handleCreateAlbum}
      />
    </Layout>
  );
}


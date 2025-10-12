import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { StreamCard } from '@/components/builder/StreamCard';
import { CreateStreamModal } from '@/components/builder/CreateStreamModal';
import { GlobalSettingsModal } from '@/components/builder/GlobalSettingsModal';
import { Plus, Settings, Radio, Play, ArrowLeft } from 'lucide-react';
import { getSlideshow } from '@/services/slideshow';
import { getStreams, createStream, deleteStream, reorderStreams, applyGlobalSettings } from '@/services/stream';
import type { Slideshow, StreamWithItems } from '@/types';

export function SlideshowBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [streams, setStreams] = useState<StreamWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGlobalSettingsModal, setShowGlobalSettingsModal] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const [slideshowData, streamsData] = await Promise.all([
        getSlideshow(id),
        getStreams(id),
      ]);
      setSlideshow(slideshowData);
      setStreams(streamsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStream = async (title: string, type: 'slideshow' | 'single-photo' | 'video') => {
    if (!id) return;
    await createStream(id, title, type);
    await loadData();
  };

  const handleDeleteStream = async (streamId: string) => {
    try {
      await deleteStream(streamId);
      setStreams(streams.filter(s => s.id !== streamId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete stream');
    }
  };

  const handleApplyGlobalSettings = async (settings: any) => {
    if (!id) return;
    await applyGlobalSettings(id, settings);
    await loadData();
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination || !id) return;

    const items = Array.from(streams);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setStreams(items);

    try {
      await reorderStreams(
        id,
        items.map(item => item.id)
      );
    } catch (err: any) {
      setError(err.message || 'Failed to reorder streams');
      await loadData();
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

  if (!slideshow) {
    return (
      <Layout>
        <Alert variant="destructive">Slideshow not found</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title={slideshow.title}
        description="Manage streams and content for your slideshow"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button variant="outline" onClick={() => setShowGlobalSettingsModal(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Global Settings
            </Button>
            <Button variant="outline" onClick={() => navigate(`/builder/${id}/settings`)}>
              <Settings className="w-4 h-4 mr-2" />
              Slideshow Settings
            </Button>
            <Button variant="outline" onClick={() => navigate(`/remote/${id}`)}>
              <Radio className="w-4 h-4 mr-2" />
              Remote
            </Button>
            <Button onClick={() => window.open(`/preview/${id}`, '_blank')}>
              <Play className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      {streams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No streams yet. Add your first stream to get started.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Stream
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Streams</h2>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Stream
            </Button>
          </div>

          <div className="space-y-3">
            {streams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                slideshowId={id!}
                onDelete={handleDeleteStream}
              />
            ))}
          </div>
        </>
      )}

      <CreateStreamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateStream}
      />

      <GlobalSettingsModal
        isOpen={showGlobalSettingsModal}
        onClose={() => setShowGlobalSettingsModal(false)}
        onApply={handleApplyGlobalSettings}
      />
    </Layout>
  );
}


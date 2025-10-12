import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { SlideshowCard } from '@/components/dashboard/SlideshowCard';
import { CreateSlideshowModal } from '@/components/dashboard/CreateSlideshowModal';
import { Plus } from 'lucide-react';
import { getSlideshows, createSlideshow, deleteSlideshow } from '@/services/slideshow';
import type { SlideshowWithStats } from '@/types';

export function Dashboard() {
  const [slideshows, setSlideshows] = useState<SlideshowWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSlideshows();
  }, []);

  const loadSlideshows = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSlideshows();
      setSlideshows(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load slideshows');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (title: string) => {
    const newSlideshow = await createSlideshow(title);
    navigate(`/builder/${newSlideshow.id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSlideshow(id);
      setSlideshows(slideshows.filter(s => s.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete slideshow');
    }
  };

  return (
    <Layout>
      <PageHeader
        title="My Slideshows"
        description="Create and manage your event slideshows"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Slideshow
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : slideshows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            You don't have any slideshows yet.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Slideshow
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {slideshows.map((slideshow) => (
            <SlideshowCard
              key={slideshow.id}
              slideshow={slideshow}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateSlideshowModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </Layout>
  );
}


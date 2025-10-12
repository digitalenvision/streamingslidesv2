import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';

interface CreateStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, type: 'slideshow' | 'single-photo' | 'video') => Promise<void>;
}

export function CreateStreamModal({ isOpen, onClose, onCreate }: CreateStreamModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'slideshow' | 'single-photo' | 'video'>('slideshow');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await onCreate(title, type);
      setTitle('');
      setType('slideshow');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create stream');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setType('slideshow');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Stream"
      description="Add a new content stream to your slideshow."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="stream-title" className="block text-sm font-medium mb-1">
            Title
          </label>
          <Input
            id="stream-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Stream"
            disabled={loading}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="stream-type" className="block text-sm font-medium mb-1">
            Type
          </label>
          <Select
            id="stream-type"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            disabled={loading}
          >
            <option value="slideshow">Photo Stream (Multiple Photos)</option>
            <option value="single-photo">Single Photo</option>
            <option value="video">Video</option>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            {error}
          </Alert>
        )}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


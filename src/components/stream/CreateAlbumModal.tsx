import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

interface CreateAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateAlbumModal({ isOpen, onClose, onCreate }: CreateAlbumModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter an album name');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await onCreate(name);
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create album');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Album"
      description="Create a new album from selected photos."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="album-name" className="block text-sm font-medium mb-1">
            Album Name
          </label>
          <Input
            id="album-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Album"
            disabled={loading}
            autoFocus
          />
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
            {loading ? 'Creating...' : 'Create Album'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


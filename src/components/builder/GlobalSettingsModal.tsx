import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import type { StreamSettings } from '@/types';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: Partial<StreamSettings>) => Promise<void>;
}

export function GlobalSettingsModal({ isOpen, onClose, onApply }: GlobalSettingsModalProps) {
  const [duration, setDuration] = useState('5');
  const [transition, setTransition] = useState('fade');
  const [transitionSpeed, setTransitionSpeed] = useState('medium');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setError(null);
    setLoading(true);

    try {
      await onApply({
        duration: parseInt(duration),
        transition: transition as any,
        transitionSpeed: transitionSpeed as any,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Global Transition Settings"
      description="Apply these settings to all streams in the slideshow."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="duration" className="block text-sm font-medium mb-1">
            Duration (seconds)
          </label>
          <Input
            id="duration"
            type="number"
            min="1"
            max="60"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="transition" className="block text-sm font-medium mb-1">
            Transition Effect
          </label>
          <Select
            id="transition"
            value={transition}
            onChange={(e) => setTransition(e.target.value)}
            disabled={loading}
          >
            <option value="none">None</option>
            <option value="fade">Fade</option>
            <option value="slide-left">Slide Left</option>
            <option value="slide-right">Slide Right</option>
            <option value="slide-up">Slide Up</option>
            <option value="slide-down">Slide Down</option>
            <option value="zoom">Zoom</option>
            <option value="dissolve">Dissolve</option>
          </Select>
        </div>

        <div>
          <label htmlFor="transition-speed" className="block text-sm font-medium mb-1">
            Transition Speed
          </label>
          <Select
            id="transition-speed"
            value={transitionSpeed}
            onChange={(e) => setTransitionSpeed(e.target.value)}
            disabled={loading}
          >
            <option value="slow">Slow</option>
            <option value="medium">Medium</option>
            <option value="fast">Fast</option>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            {error}
          </Alert>
        )}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Applying...' : 'Apply to All Streams'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


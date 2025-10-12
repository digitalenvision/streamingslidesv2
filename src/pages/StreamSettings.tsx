import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import { getStream, updateStreamSettings } from '@/services/stream';
import type { StreamWithItems, StreamSettings, TransitionType, TransitionSpeed } from '@/types';

export function StreamSettings() {
  const { id: slideshowId, streamId } = useParams<{ id: string; streamId: string }>();
  const navigate = useNavigate();
  const [stream, setStream] = useState<StreamWithItems | null>(null);
  const [settings, setSettings] = useState<StreamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (streamId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  const loadData = async () => {
    if (!streamId) {
      console.warn('StreamSettings: No streamId provided');
      return;
    }

    console.log('StreamSettings: Loading stream:', streamId);

    try {
      setLoading(true);
      setError(null);
      const data = await getStream(streamId);
      
      console.log('StreamSettings: Loaded stream data:', data);
      
      if (!data) {
        console.error('StreamSettings: Stream not found');
        setError('Stream not found');
        setLoading(false);
        return;
      }
      
      setStream(data);
      
      // Ensure settings always has default values
      const defaultSettings: StreamSettings = {
        duration: 5,
        transition: 'fade',
        transitionSpeed: 'medium',
        frequency: 5,
      };
      
      // Helper function to safely extract primitive values
      const getValue = (value: any, defaultValue: any) => {
        if (value === null || value === undefined) return defaultValue;
        // If it's an object with a 'value' property (PostgreSQL JSONB), extract it
        if (typeof value === 'object' && value !== null && 'value' in value) {
          return value.value ?? defaultValue;
        }
        return value;
      };
      
      const mergedSettings: StreamSettings = {
        duration: Number(getValue(data.settings?.duration, defaultSettings.duration)),
        transition: String(getValue(data.settings?.transition, defaultSettings.transition)) as TransitionType,
        transitionSpeed: String(getValue(data.settings?.transitionSpeed, defaultSettings.transitionSpeed)) as TransitionSpeed,
        frequency: Number(getValue(data.settings?.frequency, defaultSettings.frequency)),
      };
      
      console.log('StreamSettings: Merged settings:', mergedSettings);
      setSettings(mergedSettings);
    } catch (err: any) {
      console.error('StreamSettings: Error loading stream:', err);
      setError(err.message || 'Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!streamId || !settings) return;

    try {
      setSaving(true);
      setError(null);
      await updateStreamSettings(streamId, settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
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
        <Alert variant="destructive">
          {error || 'Stream not found'}
        </Alert>
      </Layout>
    );
  }

  if (!settings) {
    return (
      <Layout>
        <Alert variant="destructive">
          Settings could not be loaded. Please try refreshing the page.
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Stream Settings"
        description={`Configure settings for ${stream.title}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/builder/${slideshowId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Builder
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-6">
          Settings saved successfully!
        </Alert>
      )}

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Stream Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(stream.type === 'slideshow' || stream.type === 'single-photo') && (
              <div>
                <label htmlFor="duration" className="block text-sm font-medium mb-1">
                  Duration (seconds)
                </label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  max="60"
                  value={settings.duration || 5}
                  onChange={(e) =>
                    setSettings({ ...settings, duration: parseInt(e.target.value) })
                  }
                />
              </div>
            )}

            <div>
              <label htmlFor="transition" className="block text-sm font-medium mb-1">
                Transition Effect
              </label>
              <Select
                id="transition"
                value={settings.transition || 'fade'}
                onChange={(e) =>
                  setSettings({ ...settings, transition: e.target.value as TransitionType })
                }
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
                value={settings.transitionSpeed || 'medium'}
                onChange={(e) =>
                  setSettings({ ...settings, transitionSpeed: e.target.value as TransitionSpeed })
                }
              >
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </Select>
            </div>

            {(stream.type === 'single-photo' || stream.type === 'video') && (
              <div>
                <label htmlFor="frequency" className="block text-sm font-medium mb-1">
                  Frequency (show after every X slides)
                </label>
                <Input
                  id="frequency"
                  type="number"
                  min="1"
                  max="100"
                  value={Number(settings.frequency) || 5}
                  onChange={(e) =>
                    setSettings({ ...settings, frequency: parseInt(e.target.value) })
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">
                  This item will appear after every {Number(settings.frequency) || 5} regular slides
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}


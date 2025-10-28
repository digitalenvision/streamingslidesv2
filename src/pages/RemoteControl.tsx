import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  SkipForward,
  SkipBack,
  Play,
  Pause,
  RotateCcw,
  Monitor,
  MonitorOff,
  ArrowLeft,
  Radio,
  Activity,
} from 'lucide-react';
import { getSlideshow } from '@/services/slideshow';
import { sendCommand } from '@/services/command';
import { subscribeToStatus, subscribeToHeartbeat } from '@/services/status';
import { debounce } from '@/lib/utils';
import type { Slideshow, PreviewStatus } from '@/types';

export function RemoteControl() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [status, setStatus] = useState<PreviewStatus | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  // Subscribe to status updates
  useEffect(() => {
    if (!id) return;

    console.log('RemoteControl: Subscribing to status updates');
    const unsubscribe = subscribeToStatus(id, (newStatus) => {
      console.log('RemoteControl: Received status update:', newStatus);
      setStatus(newStatus);
    });

    return () => {
      console.log('RemoteControl: Unsubscribing from status updates');
      unsubscribe();
    };
  }, [id]);

  // Subscribe to heartbeat
  useEffect(() => {
    if (!id) return;

    console.log('RemoteControl: Subscribing to heartbeat');
    const unsubscribe = subscribeToHeartbeat(id, (timestamp) => {
      console.log('RemoteControl: Received heartbeat');
      setLastHeartbeat(timestamp);
      setIsPreviewActive(true);
    });

    return () => {
      console.log('RemoteControl: Unsubscribing from heartbeat');
      unsubscribe();
    };
  }, [id]);

  // Check if preview is still active
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastHeartbeat) {
        const timeSinceHeartbeat = Date.now() - lastHeartbeat;
        setIsPreviewActive(timeSinceHeartbeat < 10000); // 10 seconds timeout
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastHeartbeat]);

  const loadData = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getSlideshow(id);
      setSlideshow(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load slideshow');
    } finally {
      setLoading(false);
    }
  };

  const handleCommand = debounce(async (command: string) => {
    if (!id) return;

    try {
      setCommandError(null);
      await sendCommand(id, command as any);
    } catch (err: any) {
      setCommandError(err.message || 'Failed to send command');
      setTimeout(() => setCommandError(null), 3000);
    }
  }, 300);

  const openPreview = () => {
    window.open(`/preview/${id}`, '_blank');
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

  if (error || !slideshow) {
    return (
      <Layout>
        <Alert variant="destructive">{error || 'Slideshow not found'}</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Remote Control"
        description={`Control ${slideshow.title} remotely`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/builder/${id}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Builder
            </Button>
            <Button onClick={openPreview}>
              <Monitor className="w-4 h-4 mr-2" />
              Open Preview
            </Button>
          </>
        }
      />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Preview Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection:</span>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isPreviewActive ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className={isPreviewActive ? 'text-green-600' : 'text-red-600'}>
                    {isPreviewActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {status && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Playback:</span>
                    <span>{status.is_playing ? 'Playing' : 'Paused'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Black Screen:</span>
                    <span>{status.is_black_screen ? 'Active' : 'Inactive'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Item:</span>
                    <span>{status.current_item_index + 1}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Command Error */}
        {commandError && (
          <Alert variant="destructive">
            {commandError}
          </Alert>
        )}

        {/* Control Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5" />
              Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Navigation Controls */}
              <div>
                <p className="text-sm font-medium mb-2">Navigation</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleCommand('previous')}
                    disabled={!isPreviewActive}
                    className="h-16"
                  >
                    <SkipBack className="w-6 h-6" />
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => handleCommand(status?.is_playing ? 'pause' : 'play')}
                    disabled={!isPreviewActive}
                    className="h-16"
                  >
                    {status?.is_playing ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6" />
                    )}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => handleCommand('next')}
                    disabled={!isPreviewActive}
                    className="h-16"
                  >
                    <SkipForward className="w-6 h-6" />
                  </Button>
                </div>
              </div>

              {/* Display Controls */}
              <div>
                <p className="text-sm font-medium mb-2">Display</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleCommand(status?.is_black_screen ? 'show-screen' : 'black-screen')}
                    disabled={!isPreviewActive}
                    className="h-16"
                  >
                    {status?.is_black_screen ? (
                      <>
                        <Monitor className="w-6 h-6 mr-2" />
                        Show Screen
                      </>
                    ) : (
                      <>
                        <MonitorOff className="w-6 h-6 mr-2" />
                        Black Screen
                      </>
                    )}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => handleCommand('reload')}
                    disabled={!isPreviewActive}
                    className="h-16"
                  >
                    <RotateCcw className="w-6 h-6 mr-2" />
                    Reload Preview
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>Tip:</strong> Open the preview in a separate window or cast it to a display,
                then use these controls to manage the presentation remotely.
              </p>
              <p>
                All controls are synced in real-time via Supabase Realtime.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}


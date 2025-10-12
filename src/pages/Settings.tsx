import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Trash2 } from 'lucide-react';
import { imageCache } from '@/lib/imageCache';

export function Settings() {
  const [cacheStats, setCacheStats] = useState<{
    totalSize: number;
    imageCount: number;
    formattedSize: string;
    compressionRatio: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadCacheStats();
  }, []);

  const loadCacheStats = async () => {
    try {
      setLoading(true);
      const stats = await imageCache.getStats();
      setCacheStats(stats);
    } catch (err: any) {
      setError('Failed to load cache statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      setClearing(true);
      setError(null);
      setSuccess(null);
      await imageCache.clear();
      setCacheStats({
        totalSize: 0,
        imageCount: 0,
        formattedSize: '0 Bytes',
        compressionRatio: 0,
      });
      setSuccess('Cache cleared successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to clear cache');
    } finally {
      setClearing(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Settings"
        description="Manage your application settings"
      />

      <div className="max-w-2xl space-y-6">
        {error && (
          <Alert variant="destructive">
            {error}
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            {success}
          </Alert>
        )}

        {/* Cache Management */}
        <Card>
          <CardHeader>
            <CardTitle>Cache Management</CardTitle>
            <CardDescription>
              Manage cached images and videos for offline playback
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="md" />
              </div>
            ) : cacheStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Cache Size</p>
                    <p className="text-2xl font-semibold">{cacheStats.formattedSize}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cached Images</p>
                    <p className="text-2xl font-semibold">{cacheStats.imageCount}</p>
                  </div>
                </div>
                
                {cacheStats.compressionRatio > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      <strong>Space saved:</strong> {cacheStats.compressionRatio.toFixed(1)}% through lossless compression
                    </p>
                  </div>
                )}
                
                <Button
                  variant="destructive"
                  onClick={handleClearCache}
                  disabled={clearing}
                  className="w-full"
                >
                  {clearing ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All Cached Images
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">No cache data available</p>
            )}
            <p className="text-sm text-muted-foreground">
              Clearing the cache will remove all locally stored images and videos.
              They will be re-downloaded when needed.
            </p>
          </CardContent>
        </Card>

        {/* App Information */}
        <Card>
          <CardHeader>
            <CardTitle>Application Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-medium">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Build</span>
              <span className="text-sm font-medium">Production</span>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About Streaming Slides</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Streaming Slides is a modern web application for creating and managing
              dynamic event slideshows with real-time remote control capabilities.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}


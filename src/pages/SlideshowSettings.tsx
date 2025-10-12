import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Slider } from '@/components/ui/Slider';
import { Checkbox } from '@/components/ui/Checkbox';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ArrowLeft, Upload } from 'lucide-react';
import { getSlideshow, updateSlideshowSettings } from '@/services/slideshow';
import { uploadToImageKit } from '@/lib/imagekit';
import type { Slideshow, SlideshowSettings } from '@/types';

export function SlideshowSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [settings, setSettings] = useState<SlideshowSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getSlideshow(id);
      
      if (!data) {
        setError('Slideshow not found');
        setLoading(false);
        return;
      }
      
      setSlideshow(data);
      
      // Ensure settings has the correct structure
      const defaultSettings: SlideshowSettings = {
        background: {
          type: 'color',
          color: '#ffffff',
        },
        loop: true,
        margin: 0,
        shuffle: false,
        duration: 5,
        transition: 'fade',
        transitionSpeed: 'medium',
      };
      
      // Deep merge settings with defaults
      const mergedSettings: SlideshowSettings = {
        background: {
          type: data.settings?.background?.type || defaultSettings.background.type,
          color: data.settings?.background?.color || defaultSettings.background.color,
          imageUrl: data.settings?.background?.imageUrl,
          blur: data.settings?.background?.blur || defaultSettings.background.blur || 0,
          overlayColor: data.settings?.background?.overlayColor || defaultSettings.background.overlayColor || '#000000',
          overlayOpacity: data.settings?.background?.overlayOpacity ?? defaultSettings.background.overlayOpacity ?? 0,
        },
        loop: data.settings?.loop ?? defaultSettings.loop,
        margin: data.settings?.margin ?? defaultSettings.margin,
        shuffle: data.settings?.shuffle ?? defaultSettings.shuffle,
        duration: data.settings?.duration || defaultSettings.duration,
        transition: data.settings?.transition || defaultSettings.transition,
        transitionSpeed: data.settings?.transitionSpeed || defaultSettings.transitionSpeed,
      };
      
      setSettings(mergedSettings);
    } catch (err: any) {
      console.error('Error loading slideshow:', err);
      setError(err.message || 'Failed to load slideshow');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id || !settings) return;

    try {
      setSaving(true);
      setError(null);
      await updateSlideshowSettings(id, settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    try {
      setUploading(true);
      setError(null);
      const result = await uploadToImageKit(file, 'backgrounds');
      
      setSettings({
        ...settings,
        background: {
          ...settings.background,
          type: 'image',
          imageUrl: result.url,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  if (!slideshow || !settings || !settings.background) {
    return (
      <Layout>
        <Alert variant="destructive">
          {error || 'Slideshow not found or settings incomplete'}
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Slideshow Settings"
        description={`Configure settings for ${slideshow.title}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/builder/${id}`)}>
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

      <div className="grid gap-6 max-w-3xl">
        {/* Background Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Background</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Background Type</label>
              <div className="flex gap-4">
                <Button
                  variant={settings.background.type === 'color' ? 'default' : 'outline'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      background: { ...settings.background, type: 'color' },
                    })
                  }
                >
                  Solid Color
                </Button>
                <Button
                  variant={settings.background.type === 'image' ? 'default' : 'outline'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      background: { ...settings.background, type: 'image' },
                    })
                  }
                >
                  Background Image
                </Button>
              </div>
            </div>

            {settings.background.type === 'color' && (
              <div>
                <label htmlFor="bg-color" className="block text-sm font-medium mb-2">
                  Background Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="bg-color"
                    value={settings.background.color || '#ffffff'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        background: { ...settings.background, color: e.target.value },
                      })
                    }
                    className="h-10 w-20 rounded border"
                  />
                  <Input
                    type="text"
                    value={settings.background.color || '#ffffff'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        background: { ...settings.background, color: e.target.value },
                      })
                    }
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            )}

            {settings.background.type === 'image' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Background Image
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundImageUpload}
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Image
                      </>
                    )}
                  </Button>
                  {settings.background.imageUrl && (
                    <div className="mt-2">
                      <img
                        src={settings.background.imageUrl}
                        alt="Background"
                        className="w-full max-w-xs h-32 object-cover rounded"
                      />
                    </div>
                  )}
                </div>

                <Slider
                  label="Background Blur"
                  showValue
                  min={0}
                  max={20}
                  value={settings.background.blur || 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      background: {
                        ...settings.background,
                        blur: parseInt(e.target.value),
                      },
                    })
                  }
                />

                <div>
                  <label htmlFor="overlay-color" className="block text-sm font-medium mb-2">
                    Overlay Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="overlay-color"
                      value={settings.background.overlayColor || '#000000'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          background: {
                            ...settings.background,
                            overlayColor: e.target.value,
                          },
                        })
                      }
                      className="h-10 w-20 rounded border"
                    />
                    <Input
                      type="text"
                      value={settings.background.overlayColor || '#000000'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          background: {
                            ...settings.background,
                            overlayColor: e.target.value,
                          },
                        })
                      }
                      placeholder="#000000"
                    />
                  </div>
                </div>

                <Slider
                  label="Overlay Opacity"
                  showValue
                  min={0}
                  max={100}
                  value={(settings.background.overlayOpacity || 0) * 100}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      background: {
                        ...settings.background,
                        overlayOpacity: parseInt(e.target.value) / 100,
                      },
                    })
                  }
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Playback Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Playback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Slider
              label="Image Margin (%)"
              showValue
              min={0}
              max={50}
              value={settings.margin}
              onChange={(e) =>
                setSettings({ ...settings, margin: parseInt(e.target.value) })
              }
            />

            <Checkbox
              checked={settings.loop}
              onChange={(e) =>
                setSettings({ ...settings, loop: e.target.checked })
              }
              label="Auto-loop slideshow"
            />

            <Checkbox
              checked={settings.shuffle}
              onChange={(e) =>
                setSettings({ ...settings, shuffle: e.target.checked })
              }
              label="Shuffle all content"
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}


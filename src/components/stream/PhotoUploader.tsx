import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Upload } from 'lucide-react';
import { uploadMedia } from '@/services/photo';

interface PhotoUploaderProps {
  streamId: string;
  onUploadComplete: () => void;
}

export function PhotoUploader({ streamId, onUploadComplete }: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setProgress({ current: 0, total: files.length });

    try {
      for (let i = 0; i < files.length; i++) {
        await uploadMedia(files[i], streamId);
        setProgress({ current: i + 1, total: files.length });
      }
      onUploadComplete();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full"
      >
        {uploading ? (
          <>
            <Spinner size="sm" className="mr-2" />
            Uploading {progress?.current}/{progress?.total}...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Upload Photos/Videos
          </>
        )}
      </Button>

      {error && (
        <Alert variant="destructive">
          {error}
        </Alert>
      )}
    </div>
  );
}


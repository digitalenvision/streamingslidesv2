import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Pause, SkipForward, SkipBack, Maximize, Minimize, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { getSlideshow } from '@/services/slideshow';
import { getStreams } from '@/services/stream';
import { subscribeToCommands } from '@/services/command';
import { broadcastStatus, sendHeartbeat } from '@/services/status';
import { getTransitionVariants, shuffleArray } from '@/lib/utils';
import { imageCache } from '@/lib/imageCache';
import type { Slideshow, StreamWithItems, StreamItem, Stream } from '@/types';

// Enhanced item with stream reference for settings
interface EnhancedStreamItem extends StreamItem {
  streamSettings: Stream['settings'];
  streamType: Stream['type'];
}

export function SlideshowPreview() {
  const { id } = useParams<{ id: string }>();
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [, setStreams] = useState<StreamWithItems[]>([]);
  const [allItems, setAllItems] = useState<EnhancedStreamItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBlackScreen, setIsBlackScreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preloading, setPreloading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedUrls, setCachedUrls] = useState<Map<string, string>>(new Map());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load slideshow data
  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  // Subscribe to remote commands
  useEffect(() => {
    if (!id) return;

    console.log('SlideshowPreview: Setting up command subscription');
    const unsubscribe = subscribeToCommands(id, handleCommand);
    
    return () => {
      console.log('SlideshowPreview: Cleaning up command subscription');
      unsubscribe();
    };
  }, [id, handleCommand]);

  // Send heartbeat
  useEffect(() => {
    if (!id) return;

    console.log('SlideshowPreview: Starting heartbeat');
    
    // Send initial heartbeat immediately
    sendHeartbeat(id).catch(err => {
      console.error('Failed to send initial heartbeat:', err);
    });

    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat(id).catch(err => {
        console.error('Failed to send heartbeat:', err);
      });
    }, 5000);

    return () => {
      console.log('SlideshowPreview: Stopping heartbeat');
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [id]);

  // Broadcast status changes
  useEffect(() => {
    if (!id) return;

    console.log('SlideshowPreview: Broadcasting status update');
    broadcastStatus(id, {
      slideshow_id: id,
      is_playing: isPlaying,
      is_black_screen: isBlackScreen,
      current_stream_index: 0,
      current_item_index: currentIndex,
    }).catch(err => {
      console.error('Failed to broadcast status:', err);
    });
  }, [id, isPlaying, isBlackScreen, currentIndex]);

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || isBlackScreen || !allItems[currentIndex]) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      return;
    }

    const currentItem = allItems[currentIndex];
    const isVideoItem = currentItem.type === 'video';

    if (isVideoItem) {
      // Video will trigger next on ended event
      return;
    }

    // Priority order for duration:
    // 1. Stream-specific duration (from stream settings)
    // 2. Slideshow default duration
    // 3. Fallback to 5 seconds
    const duration = Number(getValue(currentItem.streamSettings?.duration, 
      slideshow?.settings?.duration || 5));

    console.log(`SlideshowPreview: Item ${currentIndex + 1}/${allItems.length} - Type: ${currentItem.streamType}, Duration: ${duration}s`);

    timerRef.current = setTimeout(() => {
      handleNext();
    }, duration * 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentIndex, isPlaying, isBlackScreen, allItems, slideshow]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          handleNext();
          break;
        case 'ArrowLeft':
          handlePrevious();
          break;
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, isPlaying, allItems]);

  // Mouse movement controls
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

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

      // Build proper playback sequence
      const items = buildPlaybackSequence(streamsData, slideshowData?.settings?.shuffle || false);
      
      setAllItems(items);
      setLoading(false);

      // Preload and cache images (non-blocking, continues even if some fail)
      if (items.length > 0) {
        setPreloading(true);
        const urls = items.map(item => (item.content as any).url);
        
        try {
          // Cache all images with progress tracking
          const urlMap = await imageCache.cacheImages(urls, (current, total) => {
            setPreloadProgress((current / total) * 100);
          });
          
          setCachedUrls(urlMap);
        } catch (err) {
          console.warn('Some images failed to cache, continuing anyway:', err);
          // Continue even if caching fails
        } finally {
          setPreloading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load slideshow');
      setLoading(false);
    }
  };

  /**
   * Helper to safely extract primitive values from PostgreSQL JSONB
   */
  const getValue = (value: any, defaultValue: any) => {
    if (value === null || value === undefined) return defaultValue;
    // If it's an object with a 'value' property (PostgreSQL JSONB), extract it
    if (typeof value === 'object' && value !== null && 'value' in value) {
      return value.value ?? defaultValue;
    }
    return value;
  };

  /**
   * Build the proper playback sequence respecting stream types and frequency settings
   */
  const buildPlaybackSequence = (streams: StreamWithItems[], shuffle: boolean): EnhancedStreamItem[] => {
    console.log('SlideshowPreview: Building playback sequence');
    console.log('SlideshowPreview: Total streams:', streams.length);
    
    // Separate streams by type
    const slideshowStreams = streams.filter(s => s.type === 'slideshow');
    const singlePhotoStreams = streams.filter(s => s.type === 'single-photo');
    const videoStreams = streams.filter(s => s.type === 'video');
    
    console.log('SlideshowPreview: Slideshow streams:', slideshowStreams.length);
    console.log('SlideshowPreview: Single-photo streams:', singlePhotoStreams.length);
    console.log('SlideshowPreview: Video streams:', videoStreams.length);

    // Collect all slideshow items (these form the base sequence)
    let baseItems: EnhancedStreamItem[] = [];
    slideshowStreams.forEach(stream => {
      const enhancedItems = stream.items.map(item => ({
        ...item,
        streamSettings: stream.settings,
        streamType: stream.type,
      }));
      baseItems = [...baseItems, ...enhancedItems];
    });

    // Shuffle base items if enabled (before inserting frequency items)
    if (shuffle && baseItems.length > 0) {
      baseItems = shuffleArray(baseItems);
    }

    // If no base items, just return all items in order
    if (baseItems.length === 0) {
      const allEnhancedItems: EnhancedStreamItem[] = [];
      [...singlePhotoStreams, ...videoStreams].forEach(stream => {
        stream.items.forEach(item => {
          allEnhancedItems.push({
            ...item,
            streamSettings: stream.settings,
            streamType: stream.type,
          });
        });
      });
      return allEnhancedItems;
    }

    // Now insert single-photo and video items at their frequency intervals
    const result: EnhancedStreamItem[] = [];
    let baseIndex = 0;

    // Prepare frequency items with their streams
    const frequencyStreams = [...singlePhotoStreams, ...videoStreams];
    const frequencyItems: Array<{ item: EnhancedStreamItem; frequency: number; nextInsertAt: number; itemIndex: number }> = [];
    
    frequencyStreams.forEach(stream => {
      if (stream.items.length > 0) {
        // Extract frequency value safely (handle PostgreSQL JSONB)
        const frequency = Number(getValue(stream.settings?.frequency, 5));
        console.log(`SlideshowPreview: Stream "${stream.title}" (${stream.type}) has frequency:`, frequency);
        
        stream.items.forEach(item => {
          frequencyItems.push({
            item: {
              ...item,
              streamSettings: stream.settings,
              streamType: stream.type,
            },
            frequency,
            nextInsertAt: frequency,
            itemIndex: 0,
          });
        });
      }
    });

    // Build the final sequence
    while (baseIndex < baseItems.length) {
      result.push(baseItems[baseIndex]);
      baseIndex++;

      // Check if any frequency items should be inserted after this position
      frequencyItems.forEach(freqItem => {
        if (baseIndex === freqItem.nextInsertAt) {
          console.log(`SlideshowPreview: Inserting frequency item at position ${baseIndex} (after every ${freqItem.frequency} slides)`);
          result.push(freqItem.item);
          freqItem.nextInsertAt += freqItem.frequency;
        }
      });
    }

    console.log('SlideshowPreview: Final sequence has', result.length, 'items');
    console.log('SlideshowPreview: Base items:', baseItems.length, 'Frequency items inserted:', result.length - baseItems.length);
    
    return result;
  };

  const handleCommand = useCallback((command: string, _payload?: any) => {
    console.log('SlideshowPreview: Handling command:', command);
    switch (command) {
      case 'next':
        setCurrentIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= allItems.length) {
            if (slideshow?.settings?.loop) {
              return 0;
            } else {
              setIsPlaying(false);
              return prev;
            }
          }
          return nextIndex;
        });
        break;
      case 'previous':
        setCurrentIndex(prev => {
          const prevIndex = prev - 1;
          return prevIndex < 0 ? allItems.length - 1 : prevIndex;
        });
        break;
      case 'play':
        setIsPlaying(true);
        break;
      case 'pause':
        setIsPlaying(false);
        break;
      case 'reload':
        window.location.reload();
        break;
      case 'black-screen':
        setIsBlackScreen(true);
        break;
      case 'show-screen':
        setIsBlackScreen(false);
        break;
    }
  }, [allItems.length, slideshow?.settings?.loop]);

  const handleNext = useCallback(() => {
    if (!allItems.length) return;
    
    const nextIndex = currentIndex + 1;
    if (nextIndex >= allItems.length) {
      if (slideshow?.settings?.loop) {
        setCurrentIndex(0);
      } else {
        setIsPlaying(false);
      }
    } else {
      setCurrentIndex(nextIndex);
    }
  }, [currentIndex, allItems, slideshow]);

  const handlePrevious = useCallback(() => {
    if (!allItems.length) return;
    
    const prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      setCurrentIndex(allItems.length - 1);
    } else {
      setCurrentIndex(prevIndex);
    }
  }, [currentIndex, allItems]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleVideoEnded = () => {
    console.log('SlideshowPreview: Video ended, advancing to next slide');
    handleNext();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Spinner size="lg" className="text-white" />
      </div>
    );
  }

  if (preloading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
        <Spinner size="lg" className="mb-4" />
        <p className="text-lg mb-2">Preloading content...</p>
        <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${preloadProgress}%` }}
          />
        </div>
        <p className="text-sm text-gray-400 mt-2">{Math.round(preloadProgress)}%</p>
      </div>
    );
  }

  if (error || !slideshow) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-xl mb-4">{error || 'Slideshow not found'}</p>
          <Button onClick={() => window.close()}>Close</Button>
        </div>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <p className="text-xl">No content in this slideshow</p>
      </div>
    );
  }

  const currentItem = allItems[currentIndex];
  const isVideoItem = currentItem.type === 'video';
  
  // Priority order for transition and speed:
  // 1. Stream-specific settings
  // 2. Slideshow default settings
  // 3. Fallback values
  const transition = currentItem.streamSettings?.transition || 
    slideshow.settings.transition || 
    'fade';
  const transitionSpeed = currentItem.streamSettings?.transitionSpeed || 
    slideshow.settings.transitionSpeed || 
    'medium';
  const margin = slideshow.settings.margin || 0;
  
  // Get cached URL or fallback to original
  const currentItemContent = currentItem.content as any;
  const currentUrl = cachedUrls.get(currentItemContent.url) || currentItemContent.url;
  
  console.log('SlideshowPreview: Margin/spacing applied:', margin + '%');
  console.log('SlideshowPreview: Rendering item:', { 
    index: currentIndex, 
    type: currentItem.type, 
    url: currentItemContent.url,
    displayUrl: currentUrl,
    isBlackScreen 
  });

  // Background styles
  const backgroundStyle: React.CSSProperties = {};
  if (slideshow.settings.background.type === 'color') {
    backgroundStyle.backgroundColor = slideshow.settings.background.color;
  } else if (slideshow.settings.background.imageUrl) {
    backgroundStyle.backgroundImage = `url(${slideshow.settings.background.imageUrl})`;
    backgroundStyle.backgroundSize = 'cover';
    backgroundStyle.backgroundPosition = 'center';
    if (slideshow.settings.background.blur) {
      backgroundStyle.filter = `blur(${slideshow.settings.background.blur}px)`;
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={backgroundStyle}>
      {/* Background overlay */}
      {slideshow.settings.background.type === 'image' && slideshow.settings.background.overlayColor && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: slideshow.settings.background.overlayColor,
            opacity: slideshow.settings.background.overlayOpacity || 0,
          }}
        />
      )}

      {/* Black screen */}
      {isBlackScreen && (
        <div className="absolute inset-0 bg-black z-40" />
      )}

      {/* Content */}
      {!isBlackScreen && (
        <div
          className="absolute"
          style={{ 
            top: `${margin}%`,
            left: `${margin}%`,
            right: `${margin}%`,
            bottom: `${margin}%`,
          }}
        >
          <div className="relative w-full h-full">
            <AnimatePresence initial={false}>
              <motion.div
                key={currentIndex}
                {...getTransitionVariants(transition, transitionSpeed)}
                className="absolute inset-0 flex items-center justify-center"
              >
              {isVideoItem ? (
                <video
                  ref={videoRef}
                  src={currentUrl}
                  className="max-w-full max-h-full object-contain"
                  autoPlay
                  muted={false}
                  playsInline
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    console.log(`SlideshowPreview: Video loaded, duration: ${video.duration.toFixed(2)}s`);
                  }}
                  onPlay={() => {
                    console.log('SlideshowPreview: Video started playing');
                  }}
                  onEnded={handleVideoEnded}
                  onError={(_e) => {
                    console.error('Video playback error');
                    handleNext();
                  }}
                />
              ) : (
                <img
                  src={currentUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    console.log(`SlideshowPreview: Image loaded - Natural: ${img.naturalWidth}x${img.naturalHeight}, Displayed: ${img.width}x${img.height}`);
                  }}
                  onError={(_e) => {
                    console.error('SlideshowPreview: Image failed to load');
                    handleNext();
                  }}
                />
              )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4 transition-transform ${
          showControls ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="container mx-auto flex items-center justify-center gap-4">
          <Button
            size="icon"
            variant="ghost"
            onClick={handlePrevious}
            className="text-white hover:bg-white/20"
          >
            <SkipBack className="w-5 h-5" />
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            onClick={handlePlayPause}
            className="text-white hover:bg-white/20"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            onClick={handleNext}
            className="text-white hover:bg-white/20"
          >
            <SkipForward className="w-5 h-5" />
          </Button>

          <div className="flex-1" />

          <span className="text-white text-sm">
            {currentIndex + 1} / {allItems.length}
          </span>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => window.location.reload()}
            className="text-white hover:bg-white/20"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleFullscreen}
            className="text-white hover:bg-white/20"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}


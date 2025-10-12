/**
 * Google Cast integration for casting slideshows to compatible devices
 */

const CAST_APP_ID = chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID;

export interface CastState {
  isAvailable: boolean;
  isConnected: boolean;
  currentSession: chrome.cast.Session | null;
}

let castState: CastState = {
  isAvailable: false,
  isConnected: false,
  currentSession: null,
};

/**
 * Initialize Google Cast API
 */
export function initializeCast(
  onStateChange?: (state: CastState) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.chrome || !window.chrome.cast) {
      reject(new Error('Google Cast API not available'));
      return;
    }

    const sessionRequest = new chrome.cast.SessionRequest(CAST_APP_ID);

    const apiConfig = new chrome.cast.ApiConfig(
      sessionRequest,
      (session) => {
        castState.currentSession = session;
        castState.isConnected = true;
        onStateChange?.(castState);
      },
      (availability) => {
        castState.isAvailable = availability === chrome.cast.ReceiverAvailability.AVAILABLE;
        onStateChange?.(castState);
      },
      chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED,
      chrome.cast.DefaultActionPolicy.CREATE_SESSION
    );

    chrome.cast.initialize(
      apiConfig,
      () => {
        resolve();
      },
      (error) => {
        reject(error);
      }
    );
  });
}

/**
 * Request a cast session
 */
export function requestCastSession(): Promise<chrome.cast.Session> {
  return new Promise((resolve, reject) => {
    if (!window.chrome || !window.chrome.cast) {
      reject(new Error('Google Cast API not available'));
      return;
    }

    chrome.cast.requestSession(
      (session) => {
        castState.currentSession = session;
        castState.isConnected = true;
        resolve(session);
      },
      (error) => {
        reject(error);
      }
    );
  });
}

/**
 * Load media into current cast session
 */
export function loadMediaToCast(
  contentId: string,
  contentType: string = 'text/html'
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!castState.currentSession) {
      reject(new Error('No active cast session'));
      return;
    }

    const mediaInfo = new chrome.cast.MediaInfo(contentId, contentType);
    
    castState.currentSession.loadMedia(
      mediaInfo,
      () => {
        resolve();
      },
      (error) => {
        reject(error);
      }
    );
  });
}

/**
 * Stop current cast session
 */
export function stopCastSession(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!castState.currentSession) {
      resolve();
      return;
    }

    castState.currentSession.stop(
      () => {
        castState.currentSession = null;
        castState.isConnected = false;
        resolve();
      },
      (error) => {
        reject(error);
      }
    );
  });
}

/**
 * Get current cast state
 */
export function getCastState(): CastState {
  return { ...castState };
}

/**
 * Check if casting is available
 */
export function isCastAvailable(): boolean {
  return castState.isAvailable;
}

/**
 * Check if currently connected to a cast device
 */
export function isCastConnected(): boolean {
  return castState.isConnected;
}


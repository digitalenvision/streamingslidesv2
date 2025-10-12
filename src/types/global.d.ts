/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_IMAGEKIT_PUBLIC_KEY: string;
  readonly VITE_IMAGEKIT_PRIVATE_KEY: string;
  readonly VITE_IMAGEKIT_URL_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google Cast API types
declare namespace chrome {
  namespace cast {
    class ApiConfig {
      constructor(
        sessionRequest: SessionRequest,
        sessionListener: (session: Session) => void,
        receiverListener: (availability: string) => void,
        autoJoinPolicy?: string,
        defaultActionPolicy?: string
      );
    }

    class SessionRequest {
      constructor(appId: string, capabilities?: string[], timeout?: number);
    }

    class Session {
      loadMedia(
        mediaInfo: MediaInfo,
        callback?: (media: Media) => void,
        errorCallback?: (error: any) => void
      ): void;
      stop(
        successCallback: () => void,
        errorCallback: (error: any) => void
      ): void;
    }

    class MediaInfo {
      constructor(contentId: string, contentType: string);
    }

    class Media {
      play(
        playRequest: any,
        successCallback: () => void,
        errorCallback: (error: any) => void
      ): void;
      pause(
        pauseRequest: any,
        successCallback: () => void,
        errorCallback: (error: any) => void
      ): void;
    }

    function initialize(
      apiConfig: ApiConfig,
      successCallback: () => void,
      errorCallback: (error: any) => void
    ): void;

    function requestSession(
      successCallback: (session: Session) => void,
      errorCallback: (error: any) => void
    ): void;

    const AutoJoinPolicy: {
      TAB_AND_ORIGIN_SCOPED: string;
      ORIGIN_SCOPED: string;
      PAGE_SCOPED: string;
    };

    const DefaultActionPolicy: {
      CREATE_SESSION: string;
      CAST_THIS_TAB: string;
    };

    const ReceiverAvailability: {
      AVAILABLE: string;
      UNAVAILABLE: string;
    };
  }
}

interface Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
}


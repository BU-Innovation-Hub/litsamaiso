import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Loader2, RotateCcw } from 'lucide-react';
import { Button } from './elections/ui';
import { cn } from '../lib/utils';

// Photos are sent at most this wide; the server rejects anything over 1280px
const MAX_PHOTO_WIDTH = 640;

const cameraSupported =
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

type CameraState = 'starting' | 'ready' | 'error';

const getCameraErrorMessage = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is using the camera. Close it, then try again.';
  }
  return 'The camera could not be started. Please try again.';
};

type FaceCaptureProps = {
  // Gets the captured JPEG. The camera stays on, so a failed check can be retried straight away.
  onCapture: (photo: Blob) => Promise<void>;
  busy?: boolean;
  busyLabel?: string;
  captureLabel?: string;
};

const FaceCapture: React.FC<FaceCaptureProps> = ({
  onCapture,
  busy = false,
  busyLabel = 'Checking...',
  captureLabel = 'Take photo',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraState, setCameraState] = useState<CameraState>(cameraSupported ? 'starting' : 'error');
  const [cameraError, setCameraError] = useState(
    cameraSupported ? '' : "This browser can't use the camera. Open the site in an up-to-date browser.",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!cameraSupported) return undefined;
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      .then(async (media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play().catch(() => undefined);
        }
        setCameraState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCameraError(getCameraErrorMessage(error));
        setCameraState('error');
      });

    // Turn the camera off when the component closes
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  const retryCamera = () => {
    setCameraError('');
    setCameraState('starting');
    setAttempt((count) => count + 1);
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, MAX_PHOTO_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (photo) await onCapture(photo);
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900">
        {/* Shown mirrored, like a selfie camera; the captured photo isn't flipped */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn('h-full w-full -scale-x-100 object-cover', cameraState !== 'ready' && 'invisible')}
        />

        {cameraState === 'ready' && !busy && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/70"
          />
        )}

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
            Starting camera...
          </div>
        )}

        {cameraState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/90">
            <CameraOff className="h-7 w-7" />
            <p className="max-w-xs">{cameraError}</p>
            {cameraSupported && (
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={retryCamera}>
                Try again
              </Button>
            )}
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/60 text-sm font-medium text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            {busyLabel}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        Face the camera in good light, with only you in the frame.
      </p>

      <Button
        className="h-11 w-full"
        icon={Camera}
        loading={busy}
        disabled={cameraState !== 'ready'}
        onClick={() => void capture()}
      >
        {captureLabel}
      </Button>
    </div>
  );
};

export default FaceCapture;

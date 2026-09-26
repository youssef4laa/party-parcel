'use client';

import { useEffect, useRef, useState } from 'react';

type Stage = 'start' | 'live' | 'countdown' | 'review' | 'upload-fallback';

/**
 * Section 3: a modal in a red-curtain frame with a yellow border. Live webcam preview only
 * starts after an explicit click (never on mount), a 3-2-1 countdown, a flash, and an upload
 * fallback if the camera is denied. Deliberately its own bespoke chrome rather than reusing the
 * generic cream `Modal` — the photobooth is meant to look visually distinct.
 */
export default function PhotoboothModal({
  onCapture,
  onClose,
}: {
  onCapture: (photo: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stage, setStage] = useState<Stage>('start');
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  function setPreview(url: string | null) {
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  // Unmount-only cleanup — reads the ref (not the `previewUrl` state) so it always revokes
  // whatever blob URL was current when the modal closed, not the one captured at mount.
  useEffect(
    () => () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage('live');
    } catch {
      setError('Camera access was denied or unavailable — upload a photo instead.');
      setStage('upload-fallback');
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function takePhoto() {
    setStage('countdown');
    let n = 3;
    setCount(n);
    countdownTimer.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        setCount(null);
        capture();
      } else {
        setCount(n);
      }
    }, 700);
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    canvas.toBlob(
      (blob) => {
        stopStream();
        if (blob) {
          setCapturedPhoto(blob);
          setPreview(URL.createObjectURL(blob));
        }
        setStage('review');
      },
      'image/jpeg',
      0.9,
    );
  }

  function onFileChosen(file: File | undefined) {
    if (!file) return;
    setCapturedPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
    setStage('review');
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreview(null);
    setCapturedPhoto(null);
    setStage('start');
  }

  async function save() {
    if (!capturedPhoto) return;
    setSaving(true);
    setError(null);
    try {
      await onCapture(capturedPhoto);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that photo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Photobooth"
        tabIndex={-1}
        className="relative w-full max-w-md overflow-hidden border-[6px] border-[#ffd166] bg-[#5c1420] p-4 shadow-[8px_8px_0_rgba(0,0,0,0.5)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, #7a1b2b 0 14px, #6a1524 14px 28px)' }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 z-10 border-2 border-[#ffd166] bg-[#5c1420] px-2 py-1 font-mono text-sm text-[#ffd166] hover:bg-[#ffd166] hover:text-[#5c1420]"
        >
          ✕
        </button>
        <h2 className="relative mb-3 text-center font-pixel text-sm tracking-wide text-[#ffd166]">PHOTOBOOTH</h2>

        <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden border-4 border-[#ffd166] bg-black">
          {stage === 'start' && (
            <div className="flex h-full items-center justify-center p-4 text-center font-mono text-sm text-[#fff6d5]">
              Smile! Turn on your camera to take a photo.
            </div>
          )}
          <video
            ref={videoRef}
            muted
            playsInline
            className={stage === 'live' || stage === 'countdown' ? 'h-full w-full object-cover' : 'hidden'}
          />
          {stage === 'countdown' && count !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 font-pixel text-6xl text-[#fff6d5]">
              {count}
            </div>
          )}
          {flash && <div className="absolute inset-0 bg-white" />}
          {stage === 'review' && previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not an optimizable remote asset
            <img src={previewUrl} alt="Your photobooth capture" className="h-full w-full object-cover" />
          )}
          {stage === 'upload-fallback' && !previewUrl && (
            <div className="flex h-full items-center justify-center p-4 text-center font-mono text-sm text-[#fff6d5]">
              {error ?? 'Upload a photo instead.'}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative mt-3 flex flex-col items-center gap-2">
          {stage === 'start' && (
            <button
              type="button"
              onClick={startCamera}
              className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-mono text-sm text-[#fff6d5] hover:brightness-110"
            >
              Turn on camera
            </button>
          )}
          {stage === 'live' && (
            <button
              type="button"
              onClick={takePhoto}
              className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-5 py-2 font-mono text-sm font-bold text-[#fff6d5] hover:brightness-110"
            >
              TAKE PHOTO
            </button>
          )}
          {stage === 'upload-fallback' && (
            <label className="flex cursor-pointer flex-col items-center gap-1 font-mono text-xs text-[#fff6d5]">
              Choose a photo
              <input type="file" accept="image/*" onChange={(e) => onFileChosen(e.target.files?.[0])} className="text-xs" />
            </label>
          )}
          {stage === 'review' && (
            <>
              <p className="text-center font-mono text-xs text-[#fff6d5]">
                Heads up: this photo will be visible to anyone with the room link.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={retake}
                  className="border-2 border-[#ffd166] bg-transparent px-3 py-1.5 font-mono text-sm text-[#ffd166] hover:bg-[#ffd166] hover:text-[#5c1420]"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1.5 font-mono text-sm text-[#fff6d5] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save to photo wall'}
                </button>
              </div>
            </>
          )}
          {error && stage === 'review' && <p className="font-mono text-xs text-[#ffb4b4]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

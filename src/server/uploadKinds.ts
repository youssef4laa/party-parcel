import { LIMITS } from '@/config/limits';
import { ALLOWED_AUDIO_TYPES, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from './mimeSniff';

type UploadKindConfig = { types: readonly string[]; maxBytes: number };

/** Per-goodie-type (plus photobooth) upload caps + allowed sniffed MIME types, shared by init and finalize. */
export const UPLOAD_KINDS: Record<'photo' | 'drawing' | 'video' | 'voice' | 'song' | 'photobooth', UploadKindConfig> = {
  photo: { types: ALLOWED_IMAGE_TYPES, maxBytes: LIMITS.maxPhotoBytes },
  drawing: { types: ['image/png'], maxBytes: LIMITS.maxPhotoBytes },
  // Same allowlist/cap as a goodie photo — a photobooth shot is just a photo taken in-room
  // rather than uploaded from the sender's device.
  photobooth: { types: ALLOWED_IMAGE_TYPES, maxBytes: LIMITS.maxPhotoBytes },
  video: { types: ALLOWED_VIDEO_TYPES, maxBytes: LIMITS.maxVideoUploadBytes },
  // Voice is duration-capped client-side (MAX_VOICE_SECONDS); this is the defense-in-depth byte
  // ceiling in case that's bypassed. Not separately specified, so reusing the video cap is the
  // simplest reasonable choice.
  voice: { types: ALLOWED_AUDIO_TYPES, maxBytes: LIMITS.maxVideoUploadBytes },
  song: { types: ALLOWED_AUDIO_TYPES, maxBytes: LIMITS.maxVideoUploadBytes },
};

export type UploadKind = keyof typeof UPLOAD_KINDS;

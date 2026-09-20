import { z } from 'zod';

/**
 * One zod schema per goodie type (section 5 of the brief), used to validate every payload
 * server-side (never trust the client) and shared with the client for inline form validation.
 * Every URL field is restricted to http/https — enforced here, not left to the renderer.
 */
const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid http(s) URL' },
  );

const assetKey = z.string().regex(/^[a-f0-9]{32}$/, 'Invalid asset reference');

export const NotePayload = z.object({
  type: z.literal('note'),
  text: z.string().trim().min(1).max(2000),
  paperStyle: z.enum(['lined', 'cream', 'pink']).default('cream'),
  font: z.enum(['typewriter', 'handwritten', 'pixel']).default('typewriter'),
});

export const PhotoPayload = z.object({
  type: z.literal('photo'),
  assetKeys: z.array(assetKey).min(1).max(10),
  caption: z.string().trim().max(280).optional(),
  alt: z.string().trim().max(280).optional(),
});

export const SongPayload = z
  .object({
    type: z.literal('song'),
    url: httpUrl.optional(),
    assetKey: assetKey.optional(),
    dedication: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.url) || Boolean(v.assetKey), { message: 'A song needs a link or an uploaded file' });

export const VideoPayload = z
  .object({
    type: z.literal('video'),
    url: httpUrl.optional(),
    assetKey: assetKey.optional(),
  })
  .refine((v) => Boolean(v.url) || Boolean(v.assetKey), { message: 'A video needs a link or an uploaded file' });

export const GiftPayload = z.object({
  type: z.literal('gift'),
  url: httpUrl.optional(),
  message: z.string().trim().max(1000),
  redeemCode: z.string().trim().max(200).optional(),
});

export const VoicePayload = z.object({
  type: z.literal('voice'),
  assetKey,
  durationSeconds: z.number().min(0).max(180),
  transcript: z.string().trim().max(2000).optional(),
});

export const DrawingPayload = z.object({
  type: z.literal('drawing'),
  assetKey,
});

export const LocationPayload = z
  .object({
    type: z.literal('location'),
    placeName: z.string().trim().min(1).max(200),
    mapUrl: httpUrl.optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.mapUrl) || (v.lat !== undefined && v.lng !== undefined), {
    message: 'A location needs a map link or coordinates',
  });

export const CouponPayload = z.object({
  type: z.literal('coupon'),
  title: z.string().trim().min(1).max(120),
  finePrint: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const NewsPayload = z.object({
  type: z.literal('news'),
  url: httpUrl,
  // filled in server-side at seal time — never trust a client-supplied preview
  preview: z
    .object({
      title: z.string().max(300).optional(),
      image: z.string().max(2000).optional(),
      source: z.string().max(200).optional(),
    })
    .optional(),
});

export const GoodiePayloadSchema = z.discriminatedUnion('type', [
  NotePayload,
  PhotoPayload,
  SongPayload,
  VideoPayload,
  GiftPayload,
  VoicePayload,
  DrawingPayload,
  LocationPayload,
  CouponPayload,
  NewsPayload,
]);

export type GoodiePayload = z.infer<typeof GoodiePayloadSchema>;
export type NotePayload = z.infer<typeof NotePayload>;
export type PhotoPayload = z.infer<typeof PhotoPayload>;
export type SongPayload = z.infer<typeof SongPayload>;
export type VideoPayload = z.infer<typeof VideoPayload>;
export type GiftPayload = z.infer<typeof GiftPayload>;
export type VoicePayload = z.infer<typeof VoicePayload>;
export type DrawingPayload = z.infer<typeof DrawingPayload>;
export type LocationPayload = z.infer<typeof LocationPayload>;
export type CouponPayload = z.infer<typeof CouponPayload>;
export type NewsPayload = z.infer<typeof NewsPayload>;

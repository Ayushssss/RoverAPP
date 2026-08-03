/**
 * Remote imagery.
 *
 * Every entry ships a blurhash so `expo-image` can paint a coloured blur
 * immediately and cross-fade to the photo — no grey rectangle, no layout jump.
 * The hashes are warm earth approximations, not exact encodings of each frame;
 * they only need to be close enough that the fade reads as the photo resolving.
 *
 * Unsplash URLs carry explicit `w`/`q` so we request a phone-sized image
 * instead of a full-resolution original over cellular.
 */
export interface RemoteImage {
  uri: string;
  blurhash: string;
  /** Shown by screen readers in place of the image. */
  alt: string;
}

const unsplash = (id: string, w = 1000, q = 80) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=${q}`;

/** Warm soil and low sun — the app's default photographic register. */
const EARTH_BLUR = 'LGF5?xYk^6#M@-5c,1J5@[or[Q6.';
const FIELD_BLUR = 'L9BW1S00%M9F00~qRjay00_3RjWB';
const DUSK_BLUR = 'L6H2EC=PM+yV0g-mq.wG9c010J}I';

export const imagery = {
  /** Dashboard hero. */
  fieldAerial: {
    uri: unsplash('1625246333195-78d9c38ad449'),
    blurhash: EARTH_BLUR,
    alt: 'Aerial view of cultivated farm rows at golden hour',
  } satisfies RemoteImage,

  /** Fallback / secondary hero, used when the fleet is empty. */
  youngCrop: {
    uri: unsplash('1500382017468-9049fed747ef'),
    blurhash: FIELD_BLUR,
    alt: 'Young green crop rows stretching to the horizon',
  } satisfies RemoteImage,

  /** Header art for the clusters sheet. */
  furrows: {
    uri: unsplash('1523348837708-15d4a09cfac2', 800),
    blurhash: DUSK_BLUR,
    alt: 'Ploughed furrows converging in the distance',
  } satisfies RemoteImage,
};

/** Fade duration for remote images resolving over their blurhash. */
export const IMAGE_TRANSITION_MS = 320;

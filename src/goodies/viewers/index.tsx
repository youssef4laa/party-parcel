import type { ViewerGoodie } from './types';
import NoteViewer from './NoteViewer';
import PhotoViewer from './PhotoViewer';
import SongViewer from './SongViewer';
import VideoViewer from './VideoViewer';
import GiftViewer from './GiftViewer';
import VoiceViewer from './VoiceViewer';
import DrawingViewer from './DrawingViewer';
import LocationViewer from './LocationViewer';
import CouponViewer from './CouponViewer';
import NewsViewer from './NewsViewer';

export type { ViewerGoodie } from './types';

export function GoodieViewer({
  goodie,
  boxId,
  celebrateToken,
  onRedeem,
}: {
  goodie: ViewerGoodie;
  boxId: string;
  celebrateToken: string;
  onRedeem?: (goodieId: string) => Promise<{ redeemedAt: string }>;
}) {
  switch (goodie.type) {
    case 'note':
      return <NoteViewer goodie={goodie} />;
    case 'photo':
      return <PhotoViewer goodie={goodie} />;
    case 'song':
      return <SongViewer goodie={goodie} />;
    case 'video':
      return <VideoViewer goodie={goodie} />;
    case 'gift':
      return <GiftViewer goodie={goodie} />;
    case 'voice':
      return <VoiceViewer goodie={goodie} />;
    case 'drawing':
      return <DrawingViewer goodie={goodie} />;
    case 'location':
      return <LocationViewer goodie={goodie} />;
    case 'coupon':
      return <CouponViewer goodie={goodie} boxId={boxId} celebrateToken={celebrateToken} onRedeem={onRedeem} />;
    case 'news':
      return <NewsViewer goodie={goodie} />;
    default:
      return null;
  }
}

import GoodieCard from './GoodieCard';
import { SAFE_LINK_PROPS, type ViewerGoodie } from './types';

export default function LocationViewer({ goodie }: { goodie: ViewerGoodie }) {
  const lat = typeof goodie.lat === 'number' ? goodie.lat : undefined;
  const lng = typeof goodie.lng === 'number' ? goodie.lng : undefined;
  const mapUrl = typeof goodie.mapUrl === 'string' ? goodie.mapUrl : undefined;
  const hasCoords = lat !== undefined && lng !== undefined;

  const delta = 0.01;
  const embedSrc = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng! - delta}%2C${lat! - delta}%2C${lng! + delta}%2C${lat! + delta}&layer=mapnik&marker=${lat}%2C${lng}`
    : null;

  return (
    <GoodieCard title="Treasure Map">
      <p className="text-center font-mono text-base">📍 {String(goodie.placeName ?? '')}</p>
      {embedSrc && (
        // OSM's static embed doesn't need any script permissions to render — strictest possible sandbox.
        <iframe src={embedSrc} className="h-48 w-full border-2 border-[#5e3620]/40" sandbox="" loading="lazy" title="Map" />
      )}
      {mapUrl && (
        <a href={mapUrl} {...SAFE_LINK_PROPS} className="text-center font-mono text-sm underline">
          Open in maps
        </a>
      )}
      {typeof goodie.note === 'string' && goodie.note && <p className="font-mono text-sm italic">{goodie.note}</p>}
    </GoodieCard>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, X } from 'lucide-react';
import { Button } from './ui';

/**
 * Lets the customer place the exact spot their order should go to.
 *
 * WHY IT IS WORTH ASKING. Philippine addressing rarely resolves to a building.
 * "2 Ballecer Extn., South Signal Village" comes back from Google as the purok
 * it sits in — close, but not the door. A pin the customer places themselves is
 * exact by definition, which makes the courier's price right and gives the
 * rider somewhere to navigate to.
 *
 * It is never required. Skipping it costs the customer nothing: the address is
 * geocoded on the server and the rider gets the address text and their phone
 * number either way. This only makes the result better.
 */

interface Props {
  /** Seeds the map. A partial address is fine — it only sets the initial view. */
  addressHint: string;
  value: { lat: number; lng: number } | null;
  onChange: (value: { lat: number; lng: number } | null) => void;
  /** From /site-info. Blank hides the map; the locate button still works. */
  mapsKey: string;
}

/** Roughly Metro Manila, so an unseeded map opens somewhere recognisable. */
const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

declare global {
  interface Window {
    google?: typeof globalThis extends { google: infer G } ? G : any;
    __hdsMapsPromise?: Promise<void>;
  }
}

/**
 * Loads the Maps script once per page, however many components ask for it.
 *
 * The promise is cached on `window` rather than in module scope because a
 * second <script> tag for the same library throws, and React in development
 * mounts every component twice.
 */
function loadMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__hdsMapsPromise) return window.__hdsMapsPromise;

  window.__hdsMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=marker`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the map.'));
    document.head.appendChild(script);
  });
  return window.__hdsMapsPromise;
}

export default function LocationPicker({ addressHint, value, onChange, mapsKey }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  /** The browser's own location, which needs no API key and no map. */
  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This browser cannot share your location.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        onChange(next);
        setLocating(false);
        if (mapRef.current && markerRef.current) {
          mapRef.current.setCenter(next);
          mapRef.current.setZoom(17);
          markerRef.current.setPosition(next);
        }
      },
      () => {
        setLocating(false);
        setError('We could not read your location. You can drag the pin instead.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [onChange]);

  // Builds the map once the panel is open and the script has loaded.
  useEffect(() => {
    if (!open || !mapsKey || !mapEl.current) return;
    let cancelled = false;

    loadMaps(mapsKey)
      .then(() => {
        if (cancelled || !mapEl.current) return;
        const maps = window.google.maps;
        const start = value ?? DEFAULT_CENTER;

        const map = new maps.Map(mapEl.current, {
          center: start,
          zoom: value ? 17 : 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        const marker = new maps.Marker({ position: start, map, draggable: true });

        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (position) onChange({ lat: position.lat(), lng: position.lng() });
        });
        // Tapping is easier than dragging on a phone.
        map.addListener('click', (event: any) => {
          if (!event.latLng) return;
          marker.setPosition(event.latLng);
          onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() });
        });

        mapRef.current = map;
        markerRef.current = marker;

        // Centre on the typed address, so the customer starts near where they
        // live rather than dragging across the country.
        if (!value && addressHint.trim()) {
          new maps.Geocoder().geocode(
            { address: addressHint, componentRestrictions: { country: 'PH' } },
            (results: any[], status: string) => {
              if (cancelled || status !== 'OK' || !results?.[0]) return;
              const found = results[0].geometry.location;
              map.setCenter(found);
              map.setZoom(16);
              marker.setPosition(found);
            },
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError('The map could not be loaded. You can still use your location.');
      });

    return () => {
      cancelled = true;
    };
  }, [open, mapsKey, addressHint, onChange, value]);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-cyan-700" aria-hidden />
            Pin your exact location
            <span className="font-semibold text-slate-400">(optional)</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
            {value
              ? 'Saved. Your courier price is now based on this exact spot.'
              : 'Street names in subdivisions are often hard to find. A pin gives your rider somewhere precise to go, and prices the delivery accurately.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button type="button" size="sm" variant="secondary" onClick={useMyLocation} loading={locating}>
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            Use my location
          </Button>
          {mapsKey && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide map' : 'Choose on map'}
            </Button>
          )}
        </div>
      </div>

      {value && (
        <p className="mt-2.5 flex items-center gap-2 text-xs">
          <span className="font-mono text-slate-600">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-red-700"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </button>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-amber-800">
          {error}
        </p>
      )}

      {open && mapsKey && (
        <div
          ref={mapEl}
          className="mt-3 h-64 w-full rounded-lg border border-slate-300 bg-slate-200"
          aria-label="Map for choosing your delivery location"
        />
      )}
      {open && mapsKey && (
        <p className="mt-1.5 text-[11px] text-slate-500">
          Tap the map or drag the pin to your gate.
        </p>
      )}
    </div>
  );
}

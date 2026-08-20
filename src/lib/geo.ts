import type { GeoStamp } from './types';

/**
 * Captura a localização de quem está usando o app (medida antifraude na
 * Utilidade pública) e tenta enriquecê-la com bairro/cidade via geocodificação
 * reversa gratuita do OpenStreetMap (Nominatim). Falhas de rede não bloqueiam.
 */
export function getGeo(timeoutMs = 8000): Promise<{ geo: GeoStamp | null; denied: boolean }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve({ geo: null, denied: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const geo: GeoStamp = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        // geocodificação reversa (melhor esforço, com timeout curto)
        try {
          const ctrl = new AbortController();
          const timer = window.setTimeout(() => ctrl.abort(), 4000);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${geo.lat}&lon=${geo.lng}&zoom=14&addressdetails=1&accept-language=pt-BR`,
            { signal: ctrl.signal, headers: { Accept: 'application/json' } },
          );
          window.clearTimeout(timer);
          if (res.ok) {
            const j = (await res.json()) as {
              address?: Record<string, string>;
            };
            const a = j.address ?? {};
            const city = a.city || a.town || a.village || a.suburb || a.city_district || a.county;
            const state = a.state;
            const label = [city, state].filter(Boolean).join(', ');
            if (label) geo.label = label;
          }
        } catch {
          /* sem rede ou serviço indisponível — segue só com coordenadas */
        }
        resolve({ geo, denied: false });
      },
      (err) => {
        resolve({ geo: null, denied: err.code === err.PERMISSION_DENIED });
      },
      { timeout: timeoutMs, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}

export function formatGeo(geo: GeoStamp | null | undefined): string {
  if (!geo) return 'local não capturado';
  const coords = `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`;
  return geo.label ? `${geo.label} · ${coords}` : coords;
}

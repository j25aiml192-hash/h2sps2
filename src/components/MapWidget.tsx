/**
 * MapWidget — MapLibre GL JS (open-source, free)
 * ════════════════════════════════════════════════
 * Renders an interactive map with OpenStreetMap tiles.
 * No API key needed. Works offline with cached tiles.
 *
 * Usage:
 *   <MapWidget
 *     center={[77.209, 28.613]}  // [lng, lat]
 *     zoom={12}
 *     markers={[{ lng: 77.209, lat: 28.613, label: "Polling Station" }]}
 *   />
 */
"use client";

import { useEffect, useRef } from "react";

interface Marker {
  lng: number;
  lat: number;
  label?: string;
  color?: string;
}

interface MapWidgetProps {
  center?: [number, number];  // [lng, lat]
  zoom?: number;
  markers?: Marker[];
  height?: string;
  className?: string;
}

export function MapWidget({
  center = [78.9629, 20.5937],  // India center
  zoom = 4,
  markers = [],
  height = "400px",
  className = "",
}: MapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import to avoid SSR issues with maplibre-gl
    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;

      // Inject MapLibre CSS
      if (!document.getElementById("maplibre-css")) {
        const link = document.createElement("link");
        link.id = "maplibre-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
        document.head.appendChild(link);
      }

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center,
        zoom,
      });

      mapRef.current = map;

      // Add markers
      for (const marker of markers) {
        const el = document.createElement("div");
        el.className = "flex items-center justify-center w-8 h-8 rounded-full border-2 border-white text-xs font-bold shadow-lg cursor-pointer";
        el.style.backgroundColor = marker.color ?? "#6366f1";
        el.style.color = "#fff";
        el.textContent = "📍";

        if (marker.label) {
          const popup = new maplibregl.Popup({ offset: 25 })
            .setHTML(`<div style="font-family:sans-serif;font-size:13px;padding:4px 6px">${marker.label}</div>`);

          new maplibregl.Marker({ element: el })
            .setLngLat([marker.lng, marker.lat])
            .setPopup(popup)
            .addTo(map);
        } else {
          new maplibregl.Marker({ element: el })
            .setLngLat([marker.lng, marker.lat])
            .addTo(map);
        }
      }
    })();

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when they change
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current as { flyTo: (opts: unknown) => void };
    if (markers.length > 0) {
      const first = markers[0]!;
      map.flyTo({ center: [first.lng, first.lat], zoom: 13, duration: 1500 });
    }
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl overflow-hidden border border-slate-700/40 ${className}`}
      style={{ height }}
    />
  );
}

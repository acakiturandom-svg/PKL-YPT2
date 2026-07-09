import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Building2, 
  MapPin, 
  Layers, 
  Search, 
  ExternalLink,
  Compass,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { extractCoordinates } from '../lib/utils';

// Bring Leaflet CSS into view or rely on dynamic head injection
import 'leaflet/dist/leaflet.css';

interface InteractiveOSMMapProps {
  mitras: any[];
}

export default function InteractiveOSMMap({ mitras = [] }: InteractiveOSMMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.FeatureGroup | null>(null);
  const activeTileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapStyle, setMapStyle] = useState<'roadmap' | 'satellite'>('roadmap');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMitraId, setSelectedMitraId] = useState<string | null>(null);

  // Parse location data for all mitras
  const processedMitras = mitras.map(m => {
    let coords = null;
    if (m.koordinatGPS?.lat && m.koordinatGPS?.lng) {
      coords = { lat: Number(m.koordinatGPS.lat), lng: Number(m.koordinatGPS.lng) };
    } else if (m.googleMapsLink) {
      coords = extractCoordinates(m.googleMapsLink);
    }
    return {
      ...m,
      coords
    };
  });

  const mappedList = processedMitras.filter(m => m.coords !== null);
  const unmappedList = processedMitras.filter(m => m.coords === null);

  // Filter list with search
  const filteredMapped = mappedList.filter(m => 
    m.namaMitra.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.alamat && m.alamat.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (m.jurusan && m.jurusan.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredUnmapped = unmappedList.filter(m => 
    m.namaMitra.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.alamat && m.alamat.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Define tile templates
  const tileLayers = {
    roadmap: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // To prevent map container-reinitialization issues, clean up previous instances first
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        console.error("Error removing old map instance:", e);
      }
      mapInstanceRef.current = null;
    }

    // Pristine state: clear container HTML and remove stale Leaflet properties
    // @ts-ignore
    if (mapContainerRef.current._leaflet_id) {
      // @ts-ignore
      delete mapContainerRef.current._leaflet_id;
    }
    mapContainerRef.current.innerHTML = '';

    // Default center in Indonesia (Sidoarjo/Surabaya region or center on any valid mitra)
    let initialCenter: [number, number] = [-7.45227, 112.70899]; // Sidoarjo area default
    if (mappedList.length > 0 && mappedList[0].coords) {
      initialCenter = [mappedList[0].coords.lat, mappedList[0].coords.lng];
    }

    let map: L.Map | null = null;
    try {
      map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 12,
        zoomControl: false // custom lower/compact zoom buttons
      });
    } catch (e) {
      console.error("Failed to initialize Leaflet map:", e);
      return;
    }

    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Set Default Tile Layer (Roadmap style CartoDB)
    const activeTileLayer = L.tileLayer(tileLayers.roadmap.url, {
      attribution: tileLayers.roadmap.attribution,
      maxZoom: 20
    }).addTo(map);

    const markerGroup = L.featureGroup().addTo(map);

    mapInstanceRef.current = map;
    markerGroupRef.current = markerGroup;
    activeTileLayerRef.current = activeTileLayer;

    // Populate markers initially
    updateMapMarkers();

    // Trigger map resize after a brief moment to ensure container bounds are fully loaded
    const resizeTimer = setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch (e) {
          console.warn("Could not invalidate size on layout resize:", e);
        }
      }
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.error("Error cleaning up map instance on unmount:", e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Redraw markers when mitras data, selectedId, or styles change
  useEffect(() => {
    updateMapMarkers();
  }, [mitras, mapStyle, selectedMitraId]);

  const updateMapMarkers = () => {
    const map = mapInstanceRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !markerGroup) return;

    // Clear old markers
    markerGroup.clearLayers();

    // Build custom SVG pins styled dynamically
    mappedList.forEach((mitra) => {
      if (!mitra.coords) return;

      const isCurrentlySelected = selectedMitraId === mitra.id;

      // Custom HTML Pin Marker using Leaflet DivIcon designed for pixel-perfect GPS accuracy
      const pinIcon = L.divIcon({
        className: 'custom-pin-container',
        html: `
          <div class="relative cursor-pointer" style="width: 36px; height: 44px;">
            <!-- Outer visual circle -->
            <div class="absolute top-0 left-0 w-9 h-9 ${isCurrentlySelected ? 'bg-indigo-600 ring-4 ring-indigo-100 shadow-lg shadow-indigo-300' : 'bg-emerald-600 hover:bg-indigo-600 shadow-md shadow-emerald-200'} rounded-full border-2 border-white flex items-center justify-center text-white transition-all duration-200 z-10">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${isCurrentlySelected ? 'animate-bounce' : 'hover:scale-110'}">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <!-- Triangular Pointer tip forming the visual pinpoint at y = 44px (bottom coordinate center) -->
            <div class="absolute bottom-[2px] left-[12px] w-3 h-3 rotate-45 border-r-2 border-b-2 border-white ${isCurrentlySelected ? 'bg-indigo-600' : 'bg-emerald-600 hover:bg-indigo-600'} transition-all duration-200 shadow-sm z-0"></div>
          </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 44], // Anchors the very bottom tip visually in position-lock with the latitude/longitude
        popupAnchor: [0, -44]
      });

      // HTML template for Popups directly inside Leaflet elements
      const popupContent = `
        <div class="p-3 font-sans min-w-[200px]">
          <h4 class="font-extrabold text-slate-800 text-sm mb-1">${mitra.namaMitra}</h4>
          ${mitra.kepalaMitra ? `<p class="text-[10px] text-slate-400 font-bold uppercase mb-2">Kepala: ${mitra.kepalaMitra}</p>` : ''}
          <p class="text-xs text-slate-600 mb-2 leading-snug">${mitra.alamat || 'Alamat belum diinput'}</p>
          <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 mt-2">
            <span class="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">${mitra.jurusan || 'Semua Jurusan'}</span>
            ${mitra.noHp ? `<p class="text-[10px] font-mono text-slate-500 font-semibold">${mitra.noHp}</p>` : ''}
          </div>
          ${mitra.googleMapsLink ? `
            <a href="${mitra.googleMapsLink}" target="_blank" rel="noopener noreferrer" class="mt-3 block text-center bg-blue-50 text-blue-600 font-bold text-[10px] py-1.5 rounded-md hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-1">
              Buka Google Maps
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="inline-block"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            </a>
          ` : ''}
        </div>
      `;

      const marker = L.marker([mitra.coords.lat, mitra.coords.lng], { icon: pinIcon })
        .bindPopup(popupContent, { className: 'custom-leaflet-popup' })
        .on('click', () => {
          setSelectedMitraId(mitra.id);
        });

      markerGroup.addLayer(marker);
    });

    // Auto-fit bounds if we have markers
    if (mappedList.length > 0 && map) {
      try {
        const bounds = markerGroup.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      } catch (err) {
        console.warn("Could not fit map bounds:", err);
      }
    }
  };

  // Toggle Road / Satellite view tile layer
  const toggleMapStyle = (style: 'roadmap' | 'satellite') => {
    setMapStyle(style);
    const map = mapInstanceRef.current;
    const currentLayer = activeTileLayerRef.current;
    
    if (map && currentLayer) {
      map.removeLayer(currentLayer);
      
      const nextTile = tileLayers[style];
      const newLayer = L.tileLayer(nextTile.url, {
        attribution: nextTile.attribution,
        maxZoom: style === 'satellite' ? 19 : 20
      }).addTo(map);
      
      activeTileLayerRef.current = newLayer;
    }
  };

  // Pan to a specific mitra's location on click
  const panToMitra = (mitra: any) => {
    const map = mapInstanceRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !mitra.coords) return;

    setSelectedMitraId(mitra.id);
    map.setView([mitra.coords.lat, mitra.coords.lng], 16, { animate: true, duration: 1 });

    // Find and open leaflet popup
    if (markerGroup) {
      markerGroup.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) {
          const latLng = layer.getLatLng();
          if (Math.abs(latLng.lat - mitra.coords.lat) < 0.00001 && Math.abs(latLng.lng - mitra.coords.lng) < 0.00001) {
            layer.openPopup();
          }
        }
      });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:flex-row h-[550px]">
      {/* Sidebar List */}
      <div className="w-full lg:w-80 border-r border-slate-200 flex flex-col h-1/3 lg:h-full shrink-0">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex-none">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-extrabold text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Compass size={14} className="text-emerald-600 animate-spin-slow" />
              Lokasi Bengkel & Mitra
            </h4>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
              {mappedList.length} Terpetakan
            </span>
          </div>

          {/* Search Inputs */}
          <div className="relative">
            <input 
              type="text"
              placeholder="Cari mitra / alamat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-1.5 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500 transition-colors"
            />
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {/* Scrollable list of partners */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100 p-1">
          {filteredMapped.length === 0 && filteredUnmapped.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-xs">
              Tidak ada mitra pencarian cocok
            </div>
          )}

          {/* Terpetakan Header */}
          {filteredMapped.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] text-emerald-600 font-extrabold uppercase px-2 mb-1.5 tracking-wider flex items-center gap-1">
                <CheckCircle size={10} /> Terpetakan di OSM
              </p>
              <div className="space-y-1">
                {filteredMapped.map((mitra) => (
                  <button
                    key={mitra.id}
                    onClick={() => panToMitra(mitra)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all border flex items-start gap-2.5 ${
                      selectedMitraId === mitra.id 
                        ? 'bg-emerald-50/70 border-emerald-300 shadow-sm' 
                        : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${
                      selectedMitraId === mitra.id 
                        ? 'bg-emerald-600 text-white border-emerald-500' 
                        : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      <Building2 size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate leading-tight">{mitra.namaMitra}</p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{mitra.alamat || 'Alamat tidak lengkap'}</p>
                      <span className="inline-block bg-slate-100 text-slate-600 text-[8px] font-extrabold px-1.5 py-0.5 rounded mt-1.5 uppercase">
                        {mitra.jurusan || 'Semua'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Belum Terpetakan Header */}
          {filteredUnmapped.length > 0 && (
            <div className="p-2 border-t border-slate-100 mt-2">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase px-2 mb-1.5 tracking-wider flex items-center gap-1">
                <AlertCircle size={10} /> Belum Terpetakan ({filteredUnmapped.length})
              </p>
              <p className="text-[9px] text-slate-400 px-2 pb-2 leading-relaxed italic">
                Link maps belum diinput atau koordinat tidak valid. Isi link maps pada Master Mitra.
              </p>
              <div className="space-y-1">
                {filteredUnmapped.map((mitra) => (
                  <div
                    key={mitra.id}
                    className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 flex items-start gap-2.5"
                  >
                    <div className="w-7 h-7 bg-slate-100 text-slate-400 rounded-md flex items-center justify-center shrink-0 border border-slate-200">
                      <Building2 size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-500 truncate leading-tight">{mitra.namaMitra}</p>
                      <p className="text-[9px] text-slate-400 truncate mt-0.5">{mitra.alamat || 'Alamat kosong'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map Element */}
      <div className="flex-1 relative h-2/3 lg:h-full">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Floating Styling Controls */}
        <div className="absolute top-4 right-4 z-20 flex gap-1.5 bg-white p-1 rounded-lg border border-slate-200 shadow-lg">
          <button
            onClick={() => toggleMapStyle('roadmap')}
            className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
              mapStyle === 'roadmap'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers size={11} />
            Roadmap
          </button>
          <button
            onClick={() => toggleMapStyle('satellite')}
            className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
              mapStyle === 'satellite'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Compass size={11} />
            Satelit (Esri)
          </button>
        </div>

        {/* Coordinate details panel displayed floating at the bottom */}
        {selectedMitraId && (
          <div className="absolute bottom-4 left-4 right-4 lg:right-auto lg:w-96 z-20 bg-white p-3 rounded-lg border border-slate-200 shadow-xl flex items-start gap-3 animate-fade-in">
            {(() => {
              const selectedMitra = processedMitras.find(m => m.id === selectedMitraId);
              if (!selectedMitra) return null;
              return (
                <>
                  <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-150 text-indigo-600 flex items-center justify-center shrink-0">
                    <MapPin size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs font-extrabold text-slate-800 leading-none truncate">{selectedMitra.namaMitra}</h5>
                      <span className="text-[8px] bg-slate-100 text-slate-500 font-mono px-1 py-0.5 rounded font-bold shrink-0">GPS OK</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold tracking-tight uppercase mt-1">
                      Jurusan {selectedMitra.jurusan || 'Semua'} • Kapasitas: Aktif
                    </p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5 leading-snug">{selectedMitra.alamat}</p>
                    {selectedMitra.coords && (
                      <p className="text-[9px] font-mono text-slate-400 font-semibold mt-1 bg-slate-50 px-1.5 py-0.5 rounded inline-block">
                        Lat: {selectedMitra.coords.lat.toFixed(6)}, Lng: {selectedMitra.coords.lng.toFixed(6)}
                      </p>
                    )}
                  </div>
                  {selectedMitra.googleMapsLink && (
                    <a 
                      href={selectedMitra.googleMapsLink} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-1 px-1.5 text-blue-500 hover:bg-blue-50 border border-blue-100 rounded-lg text-[10px] font-bold self-center flex items-center gap-0.5 transition-colors shrink-0"
                    >
                      Buka
                      <ExternalLink size={10} />
                    </a>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

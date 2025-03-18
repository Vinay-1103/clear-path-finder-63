
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { MapContainer } from './MapStyles';
import { AirQualityOverlay } from './AirQualityOverlay';
import { getAQIColor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MapPin, X } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { toast } from 'sonner';

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [aqiData, setAqiData] = useState<any[]>([]);
  const [iqairToken, setIqairToken] = useState(localStorage.getItem('iqair_token') || '');
  const [showMap, setShowMap] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  const handleSaveToken = () => {
    if (!iqairToken.trim()) {
      toast.error("Please enter a valid IQAir API token");
      return;
    }
    
    localStorage.setItem('iqair_token', iqairToken);
    setShowMap(true);
  };

  const handleSearch = async (query: string) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
      );
      setSearchResults(response.data.slice(0, 5));
    } catch (error) {
      console.error('Error searching locations:', error);
      toast.error("Error searching for locations");
    }
  };

  const handleSelectLocation = (location: any) => {
    const lat = parseFloat(location.lat);
    const lon = parseFloat(location.lon);
    setSelectedLocation([lat, lon]);
    
    if (map.current) {
      map.current.setView([lat, lon], 12);
      
      // Clear existing markers first
      map.current.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          layer.remove();
        }
      });
      
      // Add a marker for the selected location
      const marker = L.marker([lat, lon]).addTo(map.current);
      marker.bindPopup(`<b>${location.display_name}</b>`).openPopup();
    }
    
    setSearchResults([]);
    
    // Fetch AQI data for the selected location area
    fetchAQIDataForLocation(lat, lon);
  };
  
  const fetchAQIDataForLocation = async (lat: number, lon: number) => {
    try {
      // Define a bounding box around the selected location (roughly 20km in each direction)
      const offset = 0.18; // roughly 20km in decimal degrees
      const response = await axios.get(
        `https://api.waqi.info/v2/map/bounds?latlng=${lat-offset},${lon-offset},${lat+offset},${lon+offset}&token=${iqairToken}`
      );
      
      if (response.data && response.data.data) {
        setAqiData(response.data.data || []);
      } else {
        setAqiData([]);
        toast.warning("No air quality data available for this location");
      }
    } catch (error) {
      console.error('Error fetching AQI data for location:', error);
      toast.error("Failed to load air quality data");
      setAqiData([]);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || !showMap || mapInitialized) return;

    try {
      // Default view of USA
      map.current = L.map(mapContainer.current, {
        center: [39.8283, -98.5795],
        zoom: 4,
        layers: [
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          })
        ]
      });

      // Add zoom control
      L.control.zoom({ position: 'topright' }).addTo(map.current);
      
      setMapInitialized(true);
      
      // Load initial AQI data for USA
      const fetchAQIData = async () => {
        try {
          const response = await axios.get(
            `https://api.waqi.info/v2/map/bounds?latlng=24.396308,-125.000000,49.384358,-66.934570&token=${iqairToken}`
          );
          
          if (response.data && response.data.data) {
            setAqiData(response.data.data || []);
          } else {
            setAqiData([]);
            toast.warning("No air quality data available. Please check your API key.");
          }
        } catch (error) {
          console.error('Error fetching AQI data:', error);
          toast.error("Failed to load air quality data. Please check your API key.");
          setAqiData([]);
        }
      };

      fetchAQIData();
      
      // Force a resize event to ensure the map renders properly
      setTimeout(() => {
        if (map.current) {
          map.current.invalidateSize();
        }
      }, 100);
    } catch (error) {
      console.error('Error initializing map:', error);
      toast.error("Failed to initialize map");
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, [showMap, iqairToken, mapInitialized]);

  useEffect(() => {
    if (!map.current || !Array.isArray(aqiData) || aqiData.length === 0) return;

    // Clear existing markers
    map.current.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        layer.remove();
      }
    });

    // Add AQI data points to the map
    aqiData.forEach((point) => {
      if (point && typeof point.lat === 'number' && typeof point.lon === 'number' && typeof point.aqi === 'number') {
        L.circleMarker([point.lat, point.lon], {
          radius: 8,
          fillColor: getAQIColor(point.aqi),
          color: '#fff',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        })
          .addTo(map.current!)
          .bindPopup(`<b>AQI: ${point.aqi}</b><br>${point.station?.name || 'Unknown Station'}`);
      }
    });
  }, [aqiData]);

  if (!showMap) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 bg-gradient-to-br from-sky-50 to-indigo-100">
        <div className="w-full max-w-md p-6 space-y-6 bg-white rounded-xl shadow-lg">
          <h1 className="text-2xl font-bold text-center text-indigo-700">Air Quality Map</h1>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">IQAir Token</label>
            <Input
              type="text"
              placeholder="Enter your IQAir API key"
              value={iqairToken}
              onChange={(e) => setIqairToken(e.target.value)}
              className="border-indigo-200 focus:border-indigo-400"
            />
            <p className="text-xs text-gray-500">
              Get your API key from{' '}
              <a href="https://www.iqair.com/air-pollution-data-api" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 hover:underline">
                IQAir
              </a>
            </p>
          </div>
          <Button onClick={handleSaveToken} className="w-full bg-indigo-600 hover:bg-indigo-700">
            Show Map
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MapContainer>
      <div ref={mapContainer} className="map-container" />
      
      <SearchBar 
        onSearch={handleSearch} 
        searchResults={searchResults} 
        onSelectLocation={handleSelectLocation} 
      />
      
      <AirQualityOverlay data={aqiData} />
    </MapContainer>
  );
};

export default Map;

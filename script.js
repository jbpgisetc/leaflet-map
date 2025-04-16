// Initialize map
const map = L.map('map').setView([29.4241, -98.4936], 12);

// Basemap layers
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const satelliteHybrid = L.layerGroup([
  L.esri.basemapLayer('Imagery'),
  L.esri.basemapLayer('ImageryLabels')
]);

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'osm') {
      map.addLayer(osm);
      map.removeLayer(satelliteHybrid);
    } else {
      map.removeLayer(osm);
      map.addLayer(satelliteHybrid);
    }
  });
});

// Sidebar toggle
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// Layers
const unservedLayer = L.layerGroup();
const underservedLayer = L.layerGroup();
const otherLayer = L.layerGroup();
const allPoints = [];

// Icon builder
function createSvgIcon(color = "gray") {
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="${color}">
      <path d="M13.768,1.147a2.5,2.5,0,0,0-3.536,0L0,11.38V21a3,3,0,0,0,3,3H21a3,3,0,0,0,3-3V11.38ZM21,21H16V17.818A3.818,3.818,0,0,0,12.182,14h-.364A3.818,3.818,0,0,0,8,17.818V21H3V12.622l9-9,9,9Z"/>
    </svg>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

// Load CSV
let unservedCount = 0, underservedCount = 0, otherCount = 0;

Papa.parse("locations.csv", {
  download: true,
  header: true,
  complete: function(results) {
    results.data.forEach(row => {
      const lat = parseFloat(row.latitude);
      const lng = parseFloat(row.longitude);
      const name = row.name || 'Unknown';
      const status = row.Status?.trim().toLowerCase();

      if (!isNaN(lat) && !isNaN(lng)) {
        let icon = createSvgIcon('gray');
        let layer = otherLayer;
        otherCount++;

        if (status === 'unserved') {
          icon = createSvgIcon('green');
          layer = unservedLayer;
          unservedCount++;
          otherCount--;
        } else if (status === 'underserved') {
          icon = createSvgIcon('gold');
          layer = underservedLayer;
          underservedCount++;
          otherCount--;
        }

        const marker = L.marker([lat, lng], { icon }).bindPopup(`${name}<br>Status: ${status}`);
        marker.addTo(layer);
        allPoints.push({ lat, lng, marker });
      }
    });

    unservedLayer.addTo(map);
    underservedLayer.addTo(map);
    otherLayer.addTo(map);

    document.getElementById('count-unserved').textContent = unservedCount;
    document.getElementById('count-underserved').textContent = underservedCount;
    document.getElementById('count-other').textContent = otherCount;
  }
});

// Layer toggles
const toggleMap = {
  'toggle-unserved': unservedLayer,
  'toggle-underserved': underservedLayer,
  'toggle-other': otherLayer
};

Object.entries(toggleMap).forEach(([id, layer]) => {
  document.getElementById(id).addEventListener('change', (e) => {
    e.target.checked ? map.addLayer(layer) : map.removeLayer(layer);
  });
});

document.getElementById('toggle-eligible').addEventListener('change', function () {
  const enabled = this.checked;
  document.querySelectorAll('#layer-controls .sublayers input[type="checkbox"]').forEach(cb => {
    cb.disabled = !enabled;
    const layer = toggleMap[cb.id];
    if (layer) {
      enabled && cb.checked ? map.addLayer(layer) : map.removeLayer(layer);
    }
  });
});

// ✅ RDOF Polygon Layer
const rdofLayer = L.geoJSON(null, {
  style: {
    color: '#ff6600',
    weight: 2,
    fillOpacity: 0.1
  }
}).addTo(map);

fetch('polygons/Resound_RDOF_Texas.geojson')
  .then(res => res.json())
  .then(data => rdofLayer.addData(data));

document.getElementById('toggle-rdof').addEventListener('change', function () {
  this.checked ? map.addLayer(rdofLayer) : map.removeLayer(rdofLayer);
});

// ✅ Circle Drawing Tool
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  draw: {
    circle: { shapeOptions: { color: 'blue' } },
    polygon: false,
    rectangle: false,
    polyline: false,
    marker: false,
    circlemarker: false
  },
  edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

function pointInside(lat, lng, layer) {
  return layer.getLatLng().distanceTo([lat, lng]) <= layer.getRadius();
}

map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;
  drawnItems.clearLayers();
  drawnItems.addLayer(layer);

  let count = 0;
  allPoints.forEach(pt => {
    const visible =
      (unservedLayer.hasLayer(pt.marker) && map.hasLayer(unservedLayer)) ||
      (underservedLayer.hasLayer(pt.marker) && map.hasLayer(underservedLayer)) ||
      (otherLayer.hasLayer(pt.marker) && map.hasLayer(otherLayer));

    if (visible && pointInside(pt.lat, pt.lng, layer)) count++;
  });

  const radiusMiles = (layer.getRadius() / 1609.34).toFixed(2);
  layer.bindPopup(`${count} point(s) inside<br>Radius: ${radiusMiles} miles`).openPopup();
});

// Override distance unit to miles
L.Draw.Circle.prototype._updateTooltip = function () {
  const radiusMiles = (this._getMeasure() / 1609.34).toFixed(2);
  this._tooltip.updateContent({
    text: L.drawLocal.draw.handlers.circle.tooltip.start,
    subtext: `Radius: ${radiusMiles} miles`
  });
};

L.GeometryUtil.readableDistance = d => (d / 1609.34).toFixed(2) + ' miles';

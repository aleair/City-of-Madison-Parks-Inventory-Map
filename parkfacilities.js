// --- Initialize Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyC22hygZRCAWTgN2NXybIM8Z169rZiRvio",
  authDomain: "geog778-project.firebaseapp.com",
  projectId: "geog778-project",
  storageBucket: "geog778-project.appspot.com",
  messagingSenderId: "580713998574",
  appId: "1:580713998574:web:923c34fcb888c4be69abff"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); // Firestore database reference

// --- Initialize Leaflet Map ---
const map = L.map('mapid').setView([43.0751702, -89.3836288], 12);

// Define base layers
const streets = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors & CartoDB'
});
const aerial = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
});
streets.addTo(map); // Add default basemap

// --- Basemap Switching ---
const basemapDropdown = document.getElementById('basemapDropdown');
basemapDropdown.addEventListener('change', function () {
  const selected = this.value;
  if (selected === 'streets') {
    map.removeLayer(aerial);
    map.addLayer(streets);
  } else {
    map.removeLayer(streets);
    map.addLayer(aerial);
  }
});

// --- Setup available facility icons ---
const availableIcons = [
  "basketball-other", "basketballcourt-full", "basketballcourt-half", "basketballcourt-smallfullcourt",
  "b-cyclestalls", "beach", "benchswing", "boatmooring", "building-reservableshelterwithrestrooms",
  "canoekayakrental", "canoekayaklaunch", "concreteboatramp", "discgolfcourse", "dogoffleash",
  "gagaballpit", "gravelboatlaunchramp", "iceskating", "parkinglot-boattrailer",
  "parkinglot-boattrailerandstandard", "parkinglot-standard", "pickleballcourts", "picnictable",
  "pier", "playground-inclusive", "playground-natureplay", "playground-other", "playground-standard",
  "portapotty", "pumptrack", "rentablecanoekayakrack", "reservablebaseballfield", "reservablefootball",
  "reservablelacrosse", "reservablesoccer", "reservablesoftball", "reservableultimatefrisbee",
  "sandbox", "shadestructure", "skatepark", "skitrail", "sleddinghill", "splashpark",
  "tenniscourts", "trails", "volleyballcourts"
];

// Function to create icons based on facility type
function createIcon(iconName) {
  return L.icon({
    iconUrl: `icons/${iconName}.png`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -20]
  });
}

// --- Global Variables ---
let facilitiesLayer;
let parksLayer;
let treesLayer;
let userMoved = false;
let isLoggedIn = false;

// --- Load Facilities Layer (yearround.geojson) ---
fetch('data/yearround.geojson')
  .then(response => response.json())
  .then(async (data) => {
    const snapshot = await db.collection("facilities").get();
    const firebaseData = {};
    snapshot.forEach(doc => {
      firebaseData[doc.id] = doc.data();
    });

    facilitiesLayer = L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        const safeName = (feature.properties.ELEMENT || "").replace(/\s+/g, '').toLowerCase();
        if (safeName.includes("pier")) return L.marker(latlng, { icon: createIcon("pier") });
        if (availableIcons.includes(safeName)) return L.marker(latlng, { icon: createIcon(safeName) });
        return L.circleMarker(latlng, {
          radius: 4,
          fillColor: "#2E8B57",
          color: "#fff",
          weight: 1,
          fillOpacity: 0.8
        });
      },
      onEachFeature: (feature, layer) => {
        const fid = feature.properties.FID?.toString();
        if (fid && firebaseData[fid]) {
          if (firebaseData[fid].Status) feature.properties.Status = firebaseData[fid].Status;
          if (firebaseData[fid].Date_Modif) feature.properties.Date_Modif = firebaseData[fid].Date_Modif;
        }
        createPopupContent(feature, layer);
      }
    }).addTo(map);
  });

// --- Create Popup Content for Facilities ---
function createPopupContent(feature, layer) {
  let popupContent = `
    <div>
      <h3>${feature.properties.PARK_NAME}</h3>
      <p><strong>Element:</strong> ${feature.properties.ELEMENT}</p>
      <p><strong>Unique ID:</strong> ${feature.properties.FID}</p>
      <p><strong>Last Modified:</strong> ${feature.properties.Date_Modif}</p>
      <p><strong>Management:</strong> ${feature.properties.Management}</p>
      <p><strong>Contact Email:</strong> <a href="mailto:leair@wisc.edu">leair@wisc.edu</a></p>
      <p><strong>Phone:</strong> <a href="tel:6082664711">608 266-4711</a></p>
      <p><strong>More Info:</strong> <a href="https://www.cityofmadison.com/parks/contact/contact.cfm" target="_blank">City Parks Contact Page</a></p>`;

  if (isLoggedIn) {
    popupContent += `
      <label for="statusSelect">Status:</label><br>
      <select id="statusSelect">
        <option value="Open" ${feature.properties.Status === "Open" ? "selected" : ""}>Open</option>
        <option value="Closed" ${feature.properties.Status === "Closed" ? "selected" : ""}>Closed</option>
        <option value="Repairs" ${feature.properties.Status === "Repairs" ? "selected" : ""}>Repairs</option>
        <option value="Existing" ${feature.properties.Status === "Existing" ? "selected" : ""}>Existing</option>
        <option value="Planned" ${feature.properties.Status === "Planned" ? "selected" : ""}>Planned</option>
      </select><br><br>
      <button id="saveStatusButton">Save</button>`;
  } else {
    popupContent += `<p><strong>Status:</strong> ${feature.properties.Status}</p>`;
  }

  popupContent += `</div>`;

  layer.bindPopup(popupContent);

  // Save status if user is logged in
  layer.on('popupopen', function () {
    if (isLoggedIn) {
      const oldButton = document.getElementById('saveStatusButton');
      if (!oldButton) return;
      const newButton = oldButton.cloneNode(true);
      oldButton.parentNode.replaceChild(newButton, oldButton);

      newButton.addEventListener('click', function () {
        const newStatus = document.getElementById('statusSelect').value;
        feature.properties.Status = newStatus;

        const now = new Date();
        const formattedDate = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
        feature.properties.Date_Modif = formattedDate;

        db.collection("facilities").doc(feature.properties.FID.toString()).set({
          Status: newStatus,
          Date_Modif: formattedDate
        }, { merge: true }).then(() => {
          alert("Status updated successfully!");
        }).catch(console.error);

        layer.closePopup();
        setTimeout(() => {
          createPopupContent(feature, layer);
          layer.openPopup();
        }, 300);
      });
    }
  });
}

// --- Load Parks Layer (parks.geojson) and Create Park List ---
fetch('data/Parks.geojson')
  .then(response => response.json())
  .then(data => {
    parksLayer = L.geoJSON(data, {
      style: { color: "#228B22", weight: 1, fillOpacity: 0.1 },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.Park_Name) {
          layer.bindPopup(`${feature.properties.Park_Name}`);
        }
      }
    }).addTo(map);

    // Create Park List
    const parkNamesList = document.getElementById('parkNames');
    const parks = [];

    parksLayer.eachLayer(layer => {
      const parkName = layer.feature.properties?.Park_Name;
      if (parkName) {
        parks.push({ name: parkName, layer: layer });
      }
    });

    parks.sort((a, b) => a.name.localeCompare(b.name));

    parks.forEach(park => {
      const li = document.createElement('li');
      li.textContent = park.name;
      li.style.cursor = 'pointer';
      li.style.padding = '3px 0';

      li.addEventListener('click', () => {
        map.fitBounds(park.layer.getBounds(), { maxZoom: 16 });
        park.layer.openPopup();
      });

      parkNamesList.appendChild(li);
    });
  });

// --- Load Trees Layer (ParkTrees.geojson) ---
fetch('data/ParkTrees.geojson')
  .then(response => response.json())
  .then(data => {
    treesLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 3,
          fillColor: "#8B4513",
          color: "#8B4513",
          weight: 0,
          fillOpacity: 0.9
        });
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        layer.bindPopup(`
          <div>
            <p><strong>Park Name:</strong> ${props["Park Name"] || "Unknown"}</p>
            <p><strong>Species:</strong> ${props.Species || "Unknown"}</p>
            <p><strong>Diameter:</strong> ${props.Diameter || "Unknown"} inches</p>
            <p><strong>Site ID:</strong> ${props["Site ID"] || "Unknown"}</p>
          </div>
        `);
      }
    }).addTo(map);

    // Tree toggle control
    document.getElementById('toggleTrees').addEventListener('change', function () {
      if (this.checked) {
        map.addLayer(treesLayer);
      } else {
        map.removeLayer(treesLayer);
      }
    });
  });

// --- Facilities Toggle ---
document.getElementById('toggleFacilities').addEventListener('change', function () {
  if (this.checked) {
    map.addLayer(facilitiesLayer);
  } else {
    map.removeLayer(facilitiesLayer);
  }
});

// --- Login Button ---
document.getElementById('loginButton').addEventListener('click', function () {
  const password = prompt("Enter password:");
  if (password === "madison") {
    alert("Login successful!");
    isLoggedIn = true;
    facilitiesLayer.eachLayer(layer => createPopupContent(layer.feature, layer));
  } else {
    alert("Incorrect password.");
  }
});

// --- Restore Facilities on Move if Needed ---
map.on('moveend', function () {
  if (userMoved && facilitiesLayer) {
    const facilitiesToggle = document.getElementById('toggleFacilities');
    if (facilitiesToggle && facilitiesToggle.checked && map.hasLayer(facilitiesLayer)) {
      facilitiesLayer.eachLayer(function (layer) {
        if (!map.hasLayer(layer)) {
          map.addLayer(layer);
          if (layer.setStyle) {
            layer.setStyle({ fillColor: "#2E8B57" });
          }
        }
      });
    }
  }
});

// --- Facility Search Functionality ---
const parkSearchInput = document.getElementById('parkSearch');
parkSearchInput.addEventListener('change', function () {
  const searchValue = this.value.toLowerCase().trim();
  const searchTerms = searchValue.split(/\s+/);
  let matchingFeatures = [];
  const isNumericSearch = /^\d+$/.test(searchValue);

  facilitiesLayer.eachLayer(function (layer) {
    if (layer.setStyle) layer.setStyle({ fillColor: "#2E8B57" });
    map.addLayer(layer);

    const props = layer.feature?.properties || {};
    const { ELEMENT = "", Status = "", PARK_NAME = "", FID = "" } = props;
    const combined = `${ELEMENT.toLowerCase()} ${Status.toLowerCase()} ${PARK_NAME.toLowerCase()}`;

    if ((isNumericSearch && FID.toString() === searchValue) ||
        (!isNumericSearch && searchTerms.every(term => combined.includes(term)))) {
      matchingFeatures.push(layer);
    }
  });

  if (matchingFeatures.length > 0) {
    map.off('movestart');
    userMoved = false;
    map.fitBounds(L.featureGroup(matchingFeatures).getBounds());
    setTimeout(() => map.on('movestart', () => userMoved = true), 500);

    facilitiesLayer.eachLayer(layer => {
      if (matchingFeatures.includes(layer)) {
        if (layer.setStyle) layer.setStyle({ fillColor: "#FFD700" });
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    });
  } else {
    alert("No matching Park, Facility, Status, or Unique ID found.");
  }
});

// --- Tree Search Functionality ---
const treeSearchInput = document.getElementById('treeSearch');
treeSearchInput.addEventListener('change', function () {
  const searchValue = this.value.toLowerCase().trim();
  const searchTerms = searchValue.split(/\s+/);
  let matchingTrees = [];
  const isNumericSearch = /^\d+(\.\d+)?$/.test(searchValue);

  treesLayer.eachLayer(function (layer) {
    map.addLayer(layer);
    const props = layer.feature?.properties || {};
    const species = (props.Species || "").toLowerCase();
    const siteId = (props["Site ID"] || "").toString();
    const diameter = (props.Diameter || "").toString();

    if ((isNumericSearch && (siteId === searchValue || diameter === searchValue)) ||
        (!isNumericSearch && searchTerms.some(term => species.includes(term)))) {
      matchingTrees.push(layer);
    }
  });

  if (matchingTrees.length > 0) {
    map.off('movestart');
    userMoved = false;
    map.fitBounds(L.featureGroup(matchingTrees).getBounds());
    setTimeout(() => map.on('movestart', () => userMoved = true), 500);

    treesLayer.eachLayer(layer => {
      if (matchingTrees.includes(layer)) {
        layer.setStyle({ fillColor: "#FFD700" });
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    });

    if (isNumericSearch && matchingTrees.length === 1) {
      matchingTrees[0].openPopup();
    }
  } else {
    alert("No matching Tree Species, Site ID, or Diameter found.");
  }
});

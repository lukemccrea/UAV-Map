if (localStorage.getItem("agreed") === "true") {
    document.querySelector("#agreement").style.display = "none";
    document.querySelector("#overlay").style.display = "none";
}

//get country from user agent
let country = navigator.language || navigator.userLanguage;
country = country.split("-")[1];

let units = {
    distance: "metric",
    speed: "knots",
    temperature: "celsius",
    percipitation: "millimeter",
    pressure: "hPa"
};

if (localStorage.getItem("units") === null) {
    if (country === "US") {
        units = {
            distance: "imperial",
            speed: "mph",
            temperature: "fahrenheit",
            percipitation: "inch",
            pressure: "Hg"
        };
    }
    localStorage.setItem("units", JSON.stringify(units));
} else {
    units = JSON.parse(localStorage.getItem("units"));
}

//Load Google Charts
google.charts.load('current', { 'packages': ['corechart'] });

//add layer for facility map
function getColor(ceiling) {
    //return color from red to green
    return (toString(ceiling).includes("400") || ceiling >= 400) ? '#09ff00' :
        (toString(ceiling).includes("300") || ceiling >= 300) ? '#80ff00' :
            (toString(ceiling).includes("250") || ceiling >= 250) ? '#daf702' :
                (toString(ceiling).includes("200") || ceiling >= 200) ? '#f7ef02' :
                    (toString(ceiling).includes("150") || ceiling >= 150) ? '#f7b202' :
                        (toString(ceiling).includes("100") || ceiling >= 100) ? '#f78102' :
                            (toString(ceiling).includes("50") || ceiling >= 50) ? '#f76c02' :
                                '#f70202';
}

let map = L.map('map', {
    preferCanvas: true,
    minZoom: 3,
    maxBounds: [
        [80, -190],
        [-30, -30]
    ]
}).setView([37.8, -96], 5);

let activeMarker = null;

//Make location marker
let locationMarker = L.marker([0, 0], {
    draggable: true
})

const googleMaps = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
}).addTo(map);
const openStreetMaps = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png');
const openTopoMaps = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png');


//Retrieve airports
//Make airport layer to add markers
const airports = L.layerGroup().addTo(map);
let airportData = [];

const Http = new XMLHttpRequest();
const url = 'data/airports.json';
Http.open("GET", url);
Http.send();

Http.onreadystatechange = (e) => {
    if (Http.readyState === 4 && Http.status === 200) {
        airportData = JSON.parse(Http.responseText);

        airportData.forEach(airport => {
            //add Marker
            let marker = L.circleMarker([airport["ARP Latitude DD"], airport["ARP Longitude DD"]], {
                color: 'white',
                fillColor: '#00259e',
                fillOpacity: 0,
                opacity: 0,
                radius: 0,
                weight: 0
            });

            //Add to layer
            marker.addTo(airports).on('click', function (e) {
                L.DomEvent.stopPropagation(e);
                if (map.getZoom() >= 7) {
                    if (activeMarker) {
                        activeMarker.setStyle({
                            color: 'white',
                            fillColor: '#00259e'
                        });
                        activeMarker = null;
                    }

                    activeMarker = this;

                    viewAirport(airport["Site Id"], this);
                } else {
                    //remove default marker
                    if (locationMarker) {
                        map.removeLayer(locationMarker);
                    }

                    locationMarker.setLatLng(e.latlng).addTo(map);

                    updateInfo(e.latlng.lat, e.latlng.lng);
                }
            });
        })

        //If ICAO or Site is in URL, show airport info
        if (window.location.hash) {
            let hash = window.location.hash.substring(1);
            viewAirport(hash);
        }
    }
}

//Control layer display based on zoom level
map.on('zoomend', function () {
    if (map.getZoom() < 9) {
        //Update styles to be transparent
        airports.eachLayer(function (layer) {
            layer.setStyle({
                fillOpacity: 0,
                opacity: 0,
                radius: 0,
                weight: 0
            });
        });
    } else if (map.getZoom() >= 9 && map.getZoom() <= 10) {
        //Make airports visible
        airports.eachLayer(function (layer) {
            layer.setStyle({
                fillOpacity: 1,
                opacity: 1,
                radius: 3,
                weight: 1
            });
        });
    } else if (map.getZoom() > 10 && map.getZoom() <= 12) {
        //Make airports visible
        airports.eachLayer(function (layer) {
            layer.setStyle({
                fillOpacity: 1,
                opacity: 1,
                radius: 6,
                weight: 2
            });
        });
    } else {
        //Make airports visible
        airports.eachLayer(function (layer) {
            layer.setStyle({
                fillOpacity: 1,
                opacity: 1,
                radius: 9,
                weight: 3
            });
        });
    }
});

const nationalParkService = L.esri.featureLayer({
    url: 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/ArcGIS/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2',
    style: function (feature) {
        return {
            color: 'green',
            weight: 1
        };
    },
    updateWhenZooming: false,
    updateWhenIdle: true 
}).addTo(map);

const facilityMap = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0',
    style: function (feature) {
        return {
            color: getColor(feature.properties.CEILING),
            weight: 1
        };
    },
    updateWhenZooming: false,
    updateWhenIdle: true 
}).addTo(map);

// Add a layer for restricted UAV areas
const prohibitedAreas = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0',
    style: function (feature) {
        return {
            color: 'red',
            weight: 1
        };
    },
    updateWhenZooming: false,
    updateWhenIdle: true 
}).addTo(map);

// Add a layer for restricted UAV areas
const restrictedUAVAreas = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/DoD_Mar_13/FeatureServer/0',
    style: function (feature) {
        return {
            color: 'red',
            weight: 1
        };
    },
    updateWhenZooming: false,
    updateWhenIdle: true 
}).addTo(map);

// Recreational Fixed Flyer Sites
const recreationalFixedFlyerSites = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Recreational_Flyer_Fixed_Sites/FeatureServer/0',
    style: function (feature) {
        return {
            color: 'blue',
            weight: 1
        };
    },
    updateWhenZooming: false,
    updateWhenIdle: true 
}).addTo(map);

//Add Part Time Restrictions
const partTimeRestrictions = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Part_Time_National_Security_UAS_Flight_Restrictions/FeatureServer/0',
    style: function (feature) {
        //Is current time during active time?
        let currentTime = new Date();
        let active = true;
        if (feature.properties.STARTTIME != null && feature.properties.ENDTIME != null) {
            active = feature.properties.ENDTIME > currentTime && feature.properties.STARTTIME < currentTime;
        }
        return {
            color: active ? 'red' : 'green',
            weight: 1
        };
    },
    updateWhenZooming: false,
    updateWhenIdle: true
}).addTo(map);

//When marker is dragged update info
locationMarker.on('dragend', function (e) {
    updateInfo(e.target._latlng.lat, e.target._latlng.lng);
});

const geocoder = L.Control.Geocoder.nominatim();
const control = L.Control.geocoder({
    geocoder: geocoder
}).addTo(map);

// Handle geocoder result event
control.on('markgeocode', function (e) {
    //remove default marker
    if (locationMarker) {
        map.removeLayer(locationMarker);
    }

    const { lat, lng } = e.geocode.center;
    locationMarker.setLatLng([lat, lng]).addTo(map);
    updateInfo(lat, lng);
});

//Add layer controls
const baseMaps = {
    "Google Maps": googleMaps,
    "Open Street Maps": openStreetMaps,
    "Open Topo Maps": openTopoMaps
};

const overlayMaps = {
    "Airports": airports,
    "Restricted UAV Areas": restrictedUAVAreas,
    "Prohibited Areas": prohibitedAreas,
    "Recreational Fixed Flyer Sites": recreationalFixedFlyerSites,
    "Part Time Restrictions": partTimeRestrictions,
    "Facility Map": facilityMap,
    "National Park Service": nationalParkService
};

L.control.layers(baseMaps, overlayMaps).addTo(map);

// Add information panel
const infoPanel = L.control({ position: 'bottomleft' });
infoPanel.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info-panel leaflet-control collapsed');
    this._div.innerHTML = `
    <div class="topbar">
        <span class="title">UAV Map</span>
        <button id="infoToggle" class="toggle-button" onclick="toggleInfo()">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" width="14" viewBox="0 0 448 512"><!--!Font Awesome Free 6.5.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2023 Fonticons, Inc.--><path d="M201.4 137.4c12.5-12.5 32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L224 205.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l160-160z"/></svg>
        </button>
    </div>
    <div class="content" id="infoContent">
        <div id="nav">
            <button onclick="setPage('alerts')" id="alertsBtn" class="active">Alerts</button>
            <button onclick="setPage('weather')" id="weatherBtn">Weather</button>
        </div>
        <div id="alerts" class="page active">
            <div class="status">Click anywhere on the map to see alerts.</div>
        </div>
        <div id="weather" class="page">
            <div class="status">Click anywhere on the map to see weather info.</div>
        </div>
    </div>
    <div class="content hidden" id="airportInfo">
    </div>
    `;
    return this._div;
}
infoPanel.addTo(map);

L.DomEvent.on(L.DomUtil.get('infoContent'), 'mousewheel', L.DomEvent.stopPropagation);

document.querySelector('.info-panel').addEventListener('click', function (event) {
    event.stopPropagation();
});

function toggleInfo() {
    document.querySelector('.info-panel').classList.toggle('collapsed');
}

// Create a button and add it to the map
const locateButton = L.control({ position: 'topleft' });
locateButton.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'locate-button');
    this._div.innerHTML = '<button><i class="fa-solid fa-location-crosshairs"></i></button>';
    return this._div;
};
locateButton.addTo(map);

// Add a click event listener to the button
document.querySelector('.locate-button button').addEventListener('click', function (event) {
    event.stopPropagation();
    document.querySelector('.locate-button button').innerHTML = "<i class='fa-solid fa-spinner'></i>"
    map.locate({ setView: true, maxZoom: 16 });
});

let userLocationMarker;

// Handle location found event
map.on('locationfound', function (e) {
    map.setView(e.latlng, 16);

    // Remove the old location marker if it exists
    if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
    }

    // Add a new location marker
    userLocationMarker = L.circleMarker(e.latlng, {
        color: 'white',
        fillColor: '#217eff',
        fillOpacity: 1,
        radius: 7
    }).addTo(map);

    locationMarker.setLatLng(e.latlng).addTo(map);
    updateInfo(e.latlng.lat, e.latlng.lng);

    document.querySelector('.locate-button button').innerHTML = "<i class='fa-solid fa-location-crosshairs'></i>"
});

//move marker on click or drag
function onMapClick(e) {
    if (activeMarker) {
        activeMarker.setStyle({
            color: 'white',
            fillColor: '#00259e'
        });
        activeMarker = null;
    }

    window.location.hash = "";

    locationMarker.setLatLng(e.latlng).addTo(map);
    updateInfo(e.latlng.lat, e.latlng.lng);
}

map.on('click', onMapClick);

function updateInfo(lat, lng) {
    document.querySelector('.info-panel').classList.remove('collapsed');

    document.querySelector(".active").classList.remove("active");
    document.querySelector("#alertsBtn").classList.add("active");
    document.querySelector("#alerts").classList.add("active");
    document.querySelector("#infoContent").classList.remove("hidden");
    document.querySelector("#airportInfo").classList.add("hidden");

    document.querySelector('.info-panel .topbar .title').innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    //get address from lat and lng
    geocoder.reverse({ lat: lat, lng: lng }, map.options.crs.scale(map.getZoom()), function (results) {
        document.querySelector('.info-panel .topbar .title').innerText = results[0].name;
    });

    let queries = [
        restrictedUAVAreas.query().intersects(L.latLng(lat, lng)),
        prohibitedAreas.query().intersects(L.latLng(lat, lng)),
        partTimeRestrictions.query().intersects(L.latLng(lat, lng)),
        recreationalFixedFlyerSites.query().intersects(L.latLng(lat, lng)),
        facilityMap.query().intersects(L.latLng(lat, lng)),
        nationalParkService.query().intersects(L.latLng(lat, lng))
    ];

    let promises = queries.map((query, index) => new Promise((resolve, reject) => {
        query.run(function (error, featureCollection) {
            if (error) {
                reject(error);
            } else {
                let content = "";
                let feature = featureCollection.features[0];
                if (featureCollection.features.length > 0) {
                    switch (index) {
                        case 0:
                            content = `
                            <div class="alert">
                            <div class="bar" style="background-color: red;"></div>
                                <div class="header">
                                    <h2>${feature.properties.Facility}</h2>
                                    <span>Class ${feature.properties.Airspace} Airspace</span>
                                </div>
                                <hr>
                                <span>Ceiling: ${feature.properties.Ceiling}</span>
                                <br>
                                <span>Reason: ${feature.properties.Reason}</span>
                            </div>`;
                            break;
                        case 1:
                            content = `
                            <div class="alert">
                                <div class="bar" style="background-color: red;"></div>
                                <div class="header">
                                    <h2>${feature.properties.NAME}</h2>
                                    <span>${feature.properties.CITY}</span>
                                </div>
                                <hr>
                                <span>This is a prohibted area.</span>
                            </div>`;
                            break;
                        case 2:
                            content = `
                            <div class="alert">
                                <div class="bar" style="background-color: ${feature.properties.ENDTIME > new Date() && feature.properties.ACTIVETIME < new Date() ? "red" : "green"};"></div>
                                <div class="header">
                                    <h2>${feature.properties.Facility}</h2>
                                    <span>${feature.properties.ENDTIME > new Date() && feature.properties.ACTIVETIME < new Date() ? "Active" : "Innactive"}</span>
                                </div>
                                <hr>
                                <span>Time Active: ${new Date(feature.properties.ACTIVETIME)} - ${new Date(feature.properties.ENDTIME)}</span>
                                <br>
                                <span>Reason: ${feature.properties.Reason}</span>
                                <br>
                                <span>Ceiling: ${feature.properties.Ceiling}</span>
                            </div>
                            `;
                            break;
                        case 3:
                            content = `
                            <div class="alert">
                                <div class="bar" style="background-color: blue;"></div>
                                <div class="header">
                                    <h2>${feature.properties.Facility}</h2>
                                    <span>${feature.properties.Airspace} Airspace</span>
                                </div>
                                <hr>
                                <span>Reason: ${feature.properties.Reason}</span>
                                <br>
                                <span>Ceiling: ${feature.properties.Ceiling}</span>
                            </div>
                            `;
                            break;
                        case 4:
                            content = `
                            <div class="alert">
                                <div class="bar" style="background-color: ${feature.properties.CEILING > 400 ? "#09ff00" : feature.properties.CEILING > 300 ? "#80ff00" : feature.properties.CEILING > 250 ? "#daf702" : feature.properties.CEILING > 200 ? "#f7ef02" : feature.properties.CEILING > 150 ? "#f7b202" : feature.properties.CEILING > 100 ? "#f78102" : feature.properties.CEILING > 50 ? "#f76c02" : "#f70202"};"></div>
                                <div class="header">
                                    <h2>${feature.properties.APT1_NAME}</h2>
                                    <span>Class ${feature.properties.AIRSPACE_1} Airspace</span>
                                </div>
                                <br>
                                <span>Ceiling: ${feature.properties.CEILING} ${feature.properties.UNIT}</span>
                                <br>
                                <span><a href="#${feature.properties.APT1_ICAO}" onclick="viewAirport('${feature.properties.APT1_ICAO}')">View Airport Info</button></a>
                            </div>
                            `;

                            if (feature.properties.APT2_ICAO != "") {
                                content += `
                                <div class="alert">
                                    <div class="bar" style="background-color: ${feature.properties.CEILING > 400 ? "#09ff00" : feature.properties.CEILING > 300 ? "#80ff00" : feature.properties.CEILING > 250 ? "#daf702" : feature.properties.CEILING > 200 ? "#f7ef02" : feature.properties.CEILING > 150 ? "#f7b202" : feature.properties.CEILING > 100 ? "#f78102" : feature.properties.CEILING > 50 ? "#f76c02" : "#f70202"};"></div>
                                    <div class="header">
                                        <h2>${feature.properties.APT2_NAME}</h2>
                                        <span>Class ${feature.properties.AIRSPACE_2} Airspace</span>
                                    </div>
                                    <br>
                                    <span>Ceiling: ${feature.properties.CEILING} ${feature.properties.UNIT}</span>
                                    <br>
                                    <span><a href="#${feature.properties.APT2_ICAO}" onclick="viewAirport('${feature.properties.APT2_ICAO}')">View Airport Info</button></a>
                                    </div>`;
                            }

                            if (feature.properties.APT3_ICAO != "") {
                                content += `
                                <div class="alert">
                                    <div class="bar" style="background-color: ${feature.properties.CEILING > 400 ? "#09ff00" : feature.properties.CEILING > 300 ? "#80ff00" : feature.properties.CEILING > 250 ? "#daf702" : feature.properties.CEILING > 200 ? "#f7ef02" : feature.properties.CEILING > 150 ? "#f7b202" : feature.properties.CEILING > 100 ? "#f78102" : feature.properties.CEILING > 50 ? "#f76c02" : "#f70202"};"></div>
                                    <div class="header">
                                        <h2>${feature.properties.APT3_NAME}</h2>
                                        <span>Class ${feature.properties.AIRSPACE_3} Airspace</span>
                                    </div>
                                    <br>
                                    <span>Ceiling: ${feature.properties.CEILING} ${feature.properties.UNIT}</span>
                                    <br>
                                    <span><a href="#${feature.properties.APT3_ICAO}" onclick="viewAirport('${feature.properties.APT3_ICAO}')">View Airport Info</a></span>
                                    </div>`;
                            }

                            if (feature.properties.APT4_ICAO != "") {
                                content += `
                                <div class="alert">
                                    <div class="bar" style="background-color: ${feature.properties.CEILING > 400 ? "#09ff00" : feature.properties.CEILING > 300 ? "#80ff00" : feature.properties.CEILING > 250 ? "#daf702" : feature.properties.CEILING > 200 ? "#f7ef02" : feature.properties.CEILING > 150 ? "#f7b202" : feature.properties.CEILING > 100 ? "#f78102" : feature.properties.CEILING > 50 ? "#f76c02" : "#f70202"};"></div>
                                    <div class="header">
                                        <h2>${feature.properties.APT4_NAME}</h2>
                                        <span>Class ${feature.properties.AIRSPACE_4} Airspace</span>
                                    </div>
                                    <br>
                                    <span>Ceiling: ${feature.properties.CEILING} ${feature.properties.UNIT}</span>
                                    <br>
                                    <span><a href="#${feature.properties.APT4_ICAO}" onclick="viewAirport('${feature.properties.APT4_ICAO}')">View Airport Info</a></span>
                                    </div>`;
                            }

                            break;
                        case 5:
                            content = `
                            <div class="alert">
                            <div class="bar" style="background-color: green"></div>
                            <div class="header">
                                <h2>${feature.properties.UNIT_NAME}</h2>
                            </div>
                                <span>This is a NPS (National Park Service) Area. UAV operations are usually prohibited within NPS sites without specific authorization. Check with the NPS for more information on flying within the park.</span>
                            </div>
                            `
                    }
                }
                resolve(content);
            }
        });
    }));

    //Search Airports
    promises.push(new Promise((resolve, reject) => {

        let radius = 3 * 1609.34; // Convert miles to meters
        let results = [];
        let point = L.latLng(lat, lng);

        for (let i = 0; i < airportData.length; i++) {
            let airport = airportData[i];
            let airportLatLng = L.latLng(airport["ARP Latitude DD"], airport["ARP Longitude DD"]);

            if (point.distanceTo(airportLatLng) <= radius) {
                airport.distance = point.distanceTo(airportLatLng);
                results.push(airport);
            }
        }

        let airportContent = "";

        results.forEach(airport => {

            airportContent += `
        <div class="alert">
            <div class="bar" style="background-color: ${airport["Class"] === "B" ? "#09ff00" : airport["Class"] === "C" ? "#80ff00" : airport["Class"] === "D" ? "#daf702" : airport["Class"] === "E" ? "#f7ef02" : airport["Class"] === "G" ? "#f7b202" : "#f78102"};"></div>
            <div class="header">
                <h2>${airport["Name"]}</h2>
                <span>${airport["Facility Type"]}${airport["ICAO Id"] !== "" ? " - " : ""}${airport["ICAO Id"]}</span>
            </div>
            <hr>
            <span>Current Location is ${units.distance === "metric" ? (airport.distance / 1000).toFixed(2) + "km" : (airport.distance * 0.000621371).toFixed(2) + "mi"} from this facility.</span>
            <br>
            <span><a href="#${encodeURIComponent(airport["Site Id"])}" onclick="viewAirport('${airport["Site Id"]}')">View Airport Info</a></span>
        </div>
        `;
        })
        resolve(airportContent);
    }));

    document.querySelector('#alerts').innerHTML = `<div class="status">Loading...</div>`;

    Promise.all(promises)
        .then(results => {
            let content = results.join("");
            if (content === "") {
                content = `<div class="status">No alerts found for this Area.</div>`;
            }
            document.getElementById('alerts').innerHTML = content;
        })
        .catch(error => {
            console.error(error);
        });

    //get weather data
    const Http = new XMLHttpRequest();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,rain,showers,snowfall,pressure_msl,surface_pressure,cloud_cover,visibility,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,temperature_80m,temperature_120m,temperature_180m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&wind_speed_unit=${units.speed}&temperature_unit=${units.temperature}&precipitation_unit=${units.percipitation}&timeformat=unixtime&timezone=auto`;
    Http.open("GET", url);
    Http.send();

    Http.onreadystatechange = (e) => {
        if (Http.readyState === 4 && Http.status === 200) {
            //Update UI
            let data = JSON.parse(Http.responseText);
            console.log(data);
            document.querySelector('#weather').innerHTML = `
            <p>Last Updated ${new Date(data.current.time * 1000).toLocaleString()}</p>
            <h3>Current Weather</h3>
            <hr>
            <div id="currentWeather">
                <div class="card">
                    <span class="label">Cloud Cover</span>
                    <br>
                    <i class="fa-solid ${data.current.cloud_cover > 70 ? "fa-cloud" : data.current.cloud_cover > 30 ? "fa-cloud-sun" : "fa-sun"}"></i>
                    <br>
                    <span>${data.current.cloud_cover}%</span>
                </div>
                <div class="card">
                    <span class="label">Humididty</span>
                    <br>
                    <i class="fa-solid fa-droplet"></i>
                    <br>
                    <span>${data.current.relative_humidity_2m}%</span>
                </div>
                <div class="card">
                    <span class="label">Temperature</span>
                    <br>
                    <i class="fa-solid fa-temperature-three-quarters"></i>
                    <br>
                    <span>${data.current.temperature_2m}${data.current_units.temperature_2m}</span>
                </div>
                <div class="card">
                    <span class="label">Wind</span>
                    <br>
                    <i class="fa-solid fa-arrow-up" style="transform: rotate(${data.current.wind_direction_10m + 180}deg)"></i>
                    <br>
                    <span>Speed: ${data.current.wind_speed_10m}${data.current_units.wind_speed_10m}</span>
                    <br>
                    <span>Gusts: ${data.current.wind_gusts_10m}${data.current_units.wind_gusts_10m}</span>
                </div>
                <div class="card">
                    <span class="label">Pressure</span>
                    <br>
                    <i class="fa-solid fa-ruler-vertical"></i>
                    <br>
                    <span>Surface: ${units.pressure === "Hg" ? (data.current.pressure_msl * 0.029529983071445).toFixed(2) : data.current.pressure_msl}${units.pressure}</span>
                    <br>
                    <span>MSL: ${units.pressure === "Hg" ? (data.current.surface_pressure * 0.029529983071445).toFixed(2) : data.current.surface_pressure}${units.pressure}</span>
                </div>
            </div>
            <h3>Hourly Forecast</h3>
            <hr>
            <div id="hourlyForecast">
                <input type="radio" name="hourlyForecast" id="temperature" checked>
                <label for="temperature">Temperature</label>
                <input type="radio" name="hourlyForecast" id="precipitation">
                <label for="precipitation">Precipitation</label>
                <input type="radio" name="hourlyForecast" id="wind">
                <label for="wind">Wind</label>
                <input type="radio" name="hourlyForecast" id="visibility">
                <label for="visibility">Visibility</label>
                <div id="hourlyForecastChart">
                </div>
            <div>
            `;

            //Load Charts

            //Use only first 24 hours
            //Do not use times that are more than 1 hour in the past
            let startPoint = 0;
            for (let i = 0; i < data.hourly.time.length; i++) {
                if (data.hourly.time[i] > Math.floor(Date.now() / 1000) - 3600) {
                    startPoint = i;
                    break;
                }
            }

            let hourlyTemp = data.hourly.temperature_2m.slice(startPoint, startPoint + 24);
            let hourlyTime = data.hourly.time.slice(startPoint, startPoint + 24);
            var chartData = new google.visualization.DataTable({
                cols: [
                    { id: 'time', label: 'Time', type: 'datetime' },
                    { id: "dewPoint", label: 'Dew Point', type: 'number' },
                    { id: 'temp', label: 'Temperature', type: 'number' },
                    { id: 'annotation', label: 'Annotation', type: 'string', role: 'annotation' } // Add this line
                ],
                rows: hourlyTemp.map((temp, index) => {
                    return {
                        c: [
                            { v: new Date(hourlyTime[index] * 1000) },
                            { v: data.hourly.dew_point_2m[index + startPoint] },
                            { v: temp },
                            { v: index % 2 !== 0 ? Math.round(temp).toString() + data.hourly_units.temperature_2m : null } // Add this line
                        ]
                    }
                })
            });

            const options = {
                legend: { position: 'top' },
                chartArea: {
                    width: '94%'
                },
                width: '100%',
                annotations: {
                    alwaysOutside: true,
                    textStyle: {
                        fontSize: 10,
                    },
                }
            };

            const chart = new google.visualization.LineChart(document.getElementById('hourlyForecastChart'));

            chart.draw(chartData, options);

            window.addEventListener('resize', function () {
                // Redraw the chart
                chart.draw(chartData, options);
            });

            document.querySelector('#temperature').addEventListener('change', function () {
                chartData = new google.visualization.DataTable({
                    cols: [
                        { id: 'time', label: 'Time', type: 'datetime' },
                        { id: "dewPoint", label: 'Dew Point', type: 'number' },
                        { id: 'temp', label: 'Temperature', type: 'number' },
                        { id: 'annotation', label: 'Annotation', type: 'string', role: 'annotation' } // Add this line
                    ],
                    rows: hourlyTemp.map((temp, index) => {
                        return {
                            c: [
                                { v: new Date(hourlyTime[index] * 1000) },
                                { v: data.hourly.dew_point_2m[index + startPoint] },
                                { v: temp },
                                { v: index % 2 !== 0 ? Math.round(temp).toString() + data.hourly_units.temperature_2m : null } // Add this line
                            ]
                        }
                    })
                });
                chart.draw(chartData, options);
            });

            document.querySelector('#precipitation').addEventListener('change', function () {
                chartData = new google.visualization.DataTable({
                    cols: [
                        { id: 'time', label: 'Time', type: 'datetime' },
                        { id: 'precipitation', label: 'Precipitation', type: 'number' },
                        { id: 'annotation', label: 'Annotation', type: 'string', role: 'annotation' }
                    ],
                    rows: data.hourly.precipitation_probability.slice(startPoint, startPoint + 24).map((precipitation, index) => {
                        return {
                            c: [
                                { v: new Date(hourlyTime[index] * 1000) },
                                { v: precipitation },
                                { v: index % 2 !== 0 ? precipitation.toString() + "%" : null }
                            ]
                        }
                    })
                });
                chart.draw(chartData, options);
            });

            document.querySelector('#wind').addEventListener('change', function () {
                chartData = new google.visualization.DataTable({
                    cols: [
                        { id: 'time', label: 'Time', type: 'datetime' },
                        { id: 'wind', label: 'Wind', type: 'number' },
                        { id: 'annotation', label: 'Annotation', type: 'string', role: 'annotation' },
                        { id: 'gusts', label: 'Gusts', type: 'number' }
                    ],
                    rows: data.hourly.wind_speed_10m.slice(startPoint, startPoint + 24).map((wind, index) => {
                        let direction = data.hourly.wind_direction_10m[index + startPoint];
                        return {
                            c: [
                                { v: new Date(hourlyTime[index] * 1000) },
                                { v: wind },
                                { v: index % 2 !== 0 ? wind.toString() + " mph " + (direction <= 22.5 ? "N" : direction <= 67.5 ? "NE" : direction <= 112.5 ? "E" : direction <= 157.5 ? "SE" : direction <= 202.5 ? "S" : direction <= 247.5 ? "SW" : direction <= 292.5 ? "W" : direction <= 337.5 ? "NW" : "N") : null },
                                { v: data.hourly.wind_gusts_10m[index + startPoint] }
                            ]
                        }
                    })
                });
                chart.draw(chartData, options);
            });

            document.querySelector('#visibility').addEventListener('change', function () {
                chartData = new google.visualization.DataTable({
                    cols: [
                        { id: 'time', label: 'Time', type: 'datetime' },
                        { id: 'visibility', label: 'Visibility', type: 'number' },
                        { id: 'annotation', label: 'Annotation', type: 'string', role: 'annotation' }
                    ],
                    rows: data.hourly.visibility.slice(startPoint, startPoint + 24).map((visibility, index) => {
                        visibility = data.hourly_units.visibility === "ft" ? visibility * 0.000189394 : visibility * 0.001;
                        return {
                            c: [
                                { v: new Date(hourlyTime[index] * 1000) },
                                { v: visibility },
                                { v: index % 2 !== 0 ? visibility.toFixed(2).toString() + (data.hourly_units.visibility === "ft" ? "mi" : "km") : null }
                            ]
                        }
                    })
                });
                chart.draw(chartData, options);
            });

            document.querySelector('#weatherBtn').addEventListener('click', function () {
                chart.draw(chartData, options);
            });
        }
    }
}

function setPage(page) {
    document.querySelector(`#nav button.active`).classList.remove('active');
    document.querySelector(`#nav button#${page}Btn`).classList.add('active');
    document.querySelector(`.page.active`).classList.remove('active');
    document.querySelector(`.page#${page}`).classList.add('active');
}

function agree() {
    document.querySelector('#agreement').style.display = "none";
    document.querySelector('#overlay').style.display = "none";

    localStorage.setItem('agreed', "true");
}

function viewAirport(id, marker) {
    let airport = (id.length == 4) ? airportData.find(airport => airport["ICAO Id"] === id) : airportData.find(airport => airport["Site Id"] === id);
    console.log(airport);
    if (airport) {
        if (!marker) {
            marker = airports.getLayers().find(marker => marker.getLatLng().lat === airport["ARP Latitude DD"] && marker.getLatLng().lng === airport["ARP Longitude DD"]);
        }
        marker.setStyle({
            color: 'white',
            fillColor: '#0062ff'
        });

        activeMarker = marker;

        window.location.hash = id;
        document.querySelector(".info-panel").classList.remove("collapsed");
        document.querySelector("#airportInfo").innerHTML = `<div class="status">Loading...</div>`;
        document.querySelector(`#nav button.active`).classList.remove('active');
        document.querySelector("#airportInfo").classList.remove("hidden");
        document.querySelector("#infoContent").classList.add("hidden");


        document.querySelector('.info-panel .topbar .title').innerText = `${airport["Name"]}`;

        //Set view to airport
        map.setView([airport["ARP Latitude DD"], airport["ARP Longitude DD"]], 16);

        document.querySelector("#airportInfo").innerHTML = `
        <div id="nav">
            <button onclick="setPage('info')" id="infoBtn" class="active">Info</button>
            <button onclick="setPage('airportWeather')" id="airportWeatherBtn">Weather</button>
        </div>
        <div id="airportWeather" class="page">
        </div>
        <div id="info" class="page active">
            <h1>${airport["Name"]}</h1>
            <span>${airport["Facility Type"]}${airport["ICAO Id"] !== "" ? " - " : ""}${airport["ICAO Id"]}</span>
            
            <span style="float: right;">${airport["City"]}, ${airport["County State"]}</span>
            <hr>
            <table>
            <tr>
                <th>Elevation:</th>
                <td>${units.distance === "imperial" ? airport["Elevation"] : (airport["Elevation"] * 0.3048).toFixed(1)}${units.distance === "imperial" ? "ft" : "m"}</td>
            </tr>
            <tr>
                <th>Use:</th>
                <td>${airport["Use"]}</td>
            </tr>
            <tr>
                <th>Owner:</th>
                <td>${airport["Owner"]}</td>
            </tr>
            <tr>
                <th>UNICOM:</th>
                <td>${airport["UNICOM"]}</td>
            </tr>
        </div>
        `;
    }
}

/*
//get live aircraft data
const aircraft = L.layerGroup().addTo(map);

//make http request to get live aircraft data
const Http = new XMLHttpRequest();
const url = 'https://opensky-network.org/api/states/all?time='
Http.open("GET", url);
Http.send();

Http.onreadystatechange = (e) => {
    if (Http.readyState === 4 && Http.status === 200) {
        let data = JSON.parse(Http.responseText);
        console.log(new Date(data.time * 1000));
        for (let i = 0; i < data.states.length; i++) {
            if (data.states[i][5] != null && data.states[i][6] != null) {
                //add marker and rotate it based on heading
                let marker = L.marker([data.states[i][6], data.states[i][5]], {
                    icon: L.divIcon({
                        className: 'plane-icon',
                        html: `<img src="/icons/plane.png" style="transform: rotate(${data.states[i][10]}deg); width: 20px; hight: 20px;">`
                    })
                });

                marker.bindPopup(`
                <div class="plane-marker">
                <div class="header">
                    <span>${data.states[i][1]}</span>
                    <span>${data.states[i][2]}</span>
                </div>
                <hr>
                <div class="body">
                    <span>ICAO24: ${data.states[i][0]}</span>
                    <br>
                    <span>Altitude: ${units.distance === "metric" ? parseInt(data.states[i][7]).toFixed(1) : (parseInt(data.states[i][7]) * 3.28084).toFixed(1)}${units.distance === "metric" ? "m" : "ft"}</span>
                    <br>
                    <span>Velocity: ${(parseInt(data.states[i][9]) * 1.94384).toFixed(1)}kn</span>
                </div>
                </div>`
                );

                marker.addTo(aircraft);

            }
        }
    }
}

*/
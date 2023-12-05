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

var map = L.map('map').setView([37.8, -96], 4);

const googleMaps = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
}).addTo(map);
const openStreetMaps = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png');
const openTopoMaps = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png');

const facilityMap = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0',
    style: function (feature) {
        return {
            color: getColor(feature.properties.CEILING),
            weight: 1
        };
    }
}).addTo(map);

// Add a layer for restricted UAV areas
const prohibitedAreas = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0',
    style: function (feature) {
        return {
            color: 'red',
            weight: 1
        };
    }
}).addTo(map);

// Add a layer for restricted UAV areas
const restrictedUAVAreas = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/DoD_Mar_13/FeatureServer/0',
    style: function (feature) {
        return {
            color: 'red',
            weight: 1
        };
    }
}).addTo(map);

// Recreational Fixed Flyer Sites
const recreationalFixedFlyerSites = L.esri.featureLayer({
    url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Recreational_Flyer_Fixed_Sites/FeatureServer/0',
    style: function (feature) {
        return {
            color: 'blue',
            weight: 1
        };
    }
}).addTo(map);

// Add a layer for FAA 5010 Airports
const faa5010Airports = L.esri.dynamicMapLayer({
    url: 'https://maps6.arcgisonline.com/ArcGIS/rest/services/A-16/FAA_5010_Airports/MapServer'
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
    }
}).addTo(map);

//Make location marker
let locationMarker = L.marker([0, 0], {
    draggable: true
})

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
    "FAA 5010 Airports": faa5010Airports,
    "Restricted UAV Areas": restrictedUAVAreas,
    "Prohibited Areas": prohibitedAreas,
    "Recreational Fixed Flyer Sites": recreationalFixedFlyerSites,
    "Part Time Restrictions": partTimeRestrictions,
    "Facility Map": facilityMap
};

L.control.layers(baseMaps, overlayMaps).addTo(map);

// Add information panel
const infoPanel = L.control({ position: 'bottomleft' });
infoPanel.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info-panel leaflet-control collapsed');
    this._div.innerHTML = `
    <div class="topbar">
        <span class="title">UAS Map</span>
        <button class="toggle-button" onclick="toggleInfo()">
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
    this._div.innerHTML = '<button>Locate</button>';
    return this._div;
};
locateButton.addTo(map);

// Add a click event listener to the button
document.querySelector('.locate-button button').addEventListener('click', function (event) {
    event.stopPropagation();
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
});

//move marker on click or drag
function onMapClick(e) {
    locationMarker.setLatLng(e.latlng).addTo(map);
    updateInfo(e.latlng.lat, e.latlng.lng);
}

map.on('click', onMapClick);

function updateInfo(lat, lng) {
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
        facilityMap.query().intersects(L.latLng(lat, lng))
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
                            console.log(feature.properties);
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
                            console.log(feature.properties);
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
                                <span><a href="#${feature.properties.APT1_ICAO}" onclick="viewAirport(${feature.properties.APT1_ICAO})">View Airport Info</button></a>
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
                                    <span><a href="#${feature.properties.APT2_ICAO}" onclick="viewAirport(${feature.properties.APT2_ICAO})">View Airport Info</button></a>
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
                                    <span><a href="#${feature.properties.APT3_ICAO}" onclick="viewAirport(${feature.properties.APT3_ICAO})">View Airport Info</a></span>
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
                                    <span><a href="#${feature.properties.APT4_ICAO}" onclick="viewAirport(${feature.properties.APT4_ICAO})">View Airport Info</a></span>
                                    </div>`;
                            }

                            break;
                    }
                }
                resolve(content);
            }
        });
    }));

    document.querySelector('#alerts').innerHTML = `<div class="status">Loading...</div>`;

    Promise.all(promises)
        .then(results => {
            let content = results.join("");
            if (content === "") {
                content = `<div class="status">No alerts found for this Area.</div>`;
            }
            document.getElementById('alerts').innerHTML = content;
            document.querySelector('.info-panel').classList.remove('collapsed');
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
            <h3>Current Weather</h3>
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
                    <i class="fa-solid fa-arrow-up" style="transform: rotate(${data.current.wind_direction_10m}deg)"></i>
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
            <hr>
            <h3>Hourly Forecast</h3>
            <div id="hourlyForecast">
                <div id="hourlyForecastChart">
                </div>
            <div>
            `;

            //Load Charts
            let hourlyTemp = data.hourly.temperature_2m;
            let hourlyTime = data.hourly.time;
            var chartData = new google.visualization.DataTable(
                {
                    cols: [
                        { id: 'time', label: 'Time', type: 'datetime' },
                        { id: 'temp', label: 'Temperature', type: 'number' }
                    ],
                    rows: hourlyTemp.map((temp, index) => {
                        return {
                            c: [
                                { v: new Date(hourlyTime[index] * 1000) },
                                { v: temp }
                            ]
                        }
                    })
                }
            );

            const options = {
                legend: { position: 'none' },
                chartArea: {
                    width: '94%'
                  },
                width: '100%'
            };

            const chart = new google.visualization.LineChart(document.getElementById('hourlyForecastChart'));

            chart.draw(chartData, options);

            window.addEventListener('resize', function() {
                // Redraw the chart
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
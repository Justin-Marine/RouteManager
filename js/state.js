
// Application Constants & State
const APP = {
    state: 'OFF', 
    matching: false,
    seq: 0,
    config: { 
        survey: { name: '', ws: 'ws://localhost:8080' },
        algo: { mode: 'inc', radius: 30, interp: 0.5, overlap: 0.85 }, 
        target: { layerId: null, key: null, check: null, init: 0 } 
    },
    gpsLog: [],
    ws: null
};

// Proj4 Definitions
if (typeof proj4 !== 'undefined' && typeof ol !== 'undefined') {
    proj4.defs("EPSG:5174", "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs");
    proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");
    proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
    ol.proj.proj4.register(proj4);
}

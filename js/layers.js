
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import TileLayer from 'ol/layer/Tile'; // For WMS typically
import { TileWMS } from 'ol/source';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import { mapManager } from './map.js';
import * as shp from 'shpjs'; 

// Note: wildcard import * from shpjs might differ based on how the lib exports. 
// Usually for shpjs it exports a function `shp`. Checking implementation: 
// It effectively matches `const shp = require("shpjs")`.
// In ES module I might need `import shp from 'shpjs'`.

class LayerManager {
    constructor() {
        this.layers = []; // { id, name, type, olLayer }
        this.targetLayer = null; // Reference to the OL Vector Layer used for matching
        this.targetSource = null;
        this.targetKey = null; // The property name (column) key
    }

    async loadLocalFile(file, type) {
        if (type === 'geojson') {
            const text = await file.text();
            const format = new GeoJSON();
            // We assume the file is in 4326 usually, OL default view is WebMercator (3857)
            // But we can configure readFeatures to featureProjection
            const features = format.readFeatures(text, {
                featureProjection: mapManager.map.getView().getProjection()
            });

            const source = new VectorSource({
                features: features
            });

            const layer = new VectorLayer({
                source: source,
                style: null // Use default or custom style
            });
            
            this.addLayerToMap(file.name, 'geojson', layer);

        } else if (type === 'shp') {
            const buffer = await file.arrayBuffer();
             // shpjs defaults: shp(buffer) returns GeoJSON
            try {
                // Determine if shp default export works here
                // Simple workaround if import fails
                const geojson = await shp.default(buffer);
                
                const format = new GeoJSON();
                const features = format.readFeatures(geojson, {
                    featureProjection: mapManager.map.getView().getProjection()
                });
                
                 const source = new VectorSource({
                    features: features
                });

                const layer = new VectorLayer({
                    source: source
                });
                
                this.addLayerToMap(file.name, 'shp', layer);
            } catch (e) {
                console.error("SHP Load error", e);
                alert("Error loading SHP file. Make sure it is a valid zip containing .shp, .dbf, .shx");
            }
        }
    }

    addWFS(url, name) {
        // Basic WFS implementation
        const vectorSource = new VectorSource({
            format: new GeoJSON(),
            url: function (extent) {
                return (
                    url +
                    '?service=WFS&' +
                    'version=1.1.0&request=GetFeature&typename=' + name +
                    '&outputFormat=application/json&srsname=EPSG:3857&' +
                    'bbox=' + extent.join(',') + ',EPSG:3857'
                );
            },
            strategy: bboxStrategy,
        });

        const vectorLayer = new VectorLayer({
            source: vectorSource,
        });
        
        this.addLayerToMap(name || 'WFS Layer', 'wfs', vectorLayer);
    }

    addWMS(url, name, layersParam) {
        const wmsLayer = new TileLayer({
            source: new TileWMS({
                url: url,
                params: { 'LAYERS': layersParam, 'TILED': true },
                serverType: 'geoserver',
            }),
        });
        
        this.addLayerToMap(name || 'WMS Layer', 'wms', wmsLayer);
    }

    addLayerToMap(name, type, olLayer) {
        const id = Date.now().toString();
        olLayer.set('title', name); 
        olLayer.set('id', id);
        
        mapManager.addLayer(olLayer);
        
        this.layers.push({
            id,
            name,
            type,
            olLayer
        });
        
        this.updateUI();
    }
    
    setTarget(layerId, keyColumn) {
        const layerObj = this.layers.find(l => l.id === layerId);
        if (layerObj && (layerObj.type === 'geojson' || layerObj.type === 'wfs' || layerObj.type === 'shp')) {
            this.targetLayer = layerObj.olLayer;
            this.targetSource = this.targetLayer.getSource();
            this.targetKey = keyColumn;
            console.log(`Target set to ${layerObj.name} with key ${keyColumn}`);
            return true;
        }
        return false;
    }
    
    updateUI() {
        // Dispatch event or callback to update UI list
        const event = new CustomEvent('layersUpdated', { detail: this.layers });
        document.dispatchEvent(event);
    }
    
    getAvailableColumns(layerId) {
        const layerObj = this.layers.find(l => l.id === layerId);
        if (layerObj && layerObj.olLayer.getSource().getFeatures().length > 0) {
            const feature = layerObj.olLayer.getSource().getFeatures()[0];
            return feature.getKeys().filter(k => k !== 'geometry');
        }
        return [];
    }
}

export const layerManager = new LayerManager();


import * as turf from '@turf/turf';
import { layerManager } from './layers.js';
import { settings } from './settings.js';
import GeoJSON from 'ol/format/GeoJSON';

class AlgorithmManager {
    constructor() {
        this.matchedTraces = {}; // { link_id: [points...] }
        this.passedLinks = {}; // { link_id: timestamp }
        this.lastGpsPosition = null;
        this.format = new GeoJSON();
    }

    processPosition(position) { // position: [lon, lat]
        const { bufferRadius, interpolationStep } = settings.get('algorithm');
        
        // 1. Interpolation Logic
        const positionsToProcess = [];
        if (this.lastGpsPosition) {
            const from = turf.point(this.lastGpsPosition);
            const to = turf.point(position);
            const dist = turf.distance(from, to, { units: 'meters' });
            
            if (dist > interpolationStep && dist < 5) { // 5m jump check
                const steps = Math.floor(dist / interpolationStep);
                for (let i = 1; i <= steps; i++) {
                    const interp = turf.along(turf.lineString([this.lastGpsPosition, position]), (i * interpolationStep) / 1000, { units: 'kilometers' });
                    positionsToProcess.push(interp.geometry.coordinates);
                }
            }
        }
        positionsToProcess.push(position);
        this.lastGpsPosition = position;

        // 2. Process each position
        positionsToProcess.forEach(pos => this.matchPoint(pos));
    }

    matchPoint(pos) {
        // Guard: Check if target layer exists
        if (!layerManager.targetSource) return;

        const { bufferRadius, overlapRatio, mode, targetKeyColumn } = settings.get('algorithm');
        const point = turf.point(pos);
        
        // Find candidates within buffer
        // Note: iteratng features in OL source. For large datasets this is slow. 
        // Ideally use a spatial index (RBush). OL has one internally `source.getFeaturesInExtent`.
        // We create a bounding box around the point with bufferRadius.
        
        // Rough approx of degrees for bufferRadius (m)
        const delta = bufferRadius / 111000; 
        const extent = [pos[0]-delta, pos[1]-delta, pos[0]+delta, pos[1]+delta];
        
        const candidates = layerManager.targetSource.getFeaturesInExtent(extent);
        
        candidates.forEach(feature => {
            const geom = feature.getGeometry();
            const type = geom.getType();
            if (type !== 'LineString' && type !== 'MultiLineString') return;
            
            // Convert to Turf
            const turfLine = this.format.writeFeatureObject(feature);
            
            // Strict distance check (Turf)
            const dist = turf.pointToLineDistance(point, turfLine, { units: 'meters' });
            if (dist > bufferRadius) return;
            
            // Snap point to line
            const snapped = turf.nearestPointOnLine(turfLine, point);
            
            this.updateTrace(feature, snapped);
        });
    }

    updateTrace(feature, snappedPoint) {
        const id = feature.get('id') || feature.ol_uid; // ensure unique ID
        const overlapRatio = settings.get('algorithm.overlapRatio');
        
        if (this.passedLinks[id]) {
            // Check timeout (e.g. 10 seconds? Spec says "specified time". Let's assume 30s for now or add to settings)
            if (Date.now() - this.passedLinks[id] < 10000) return; 
            delete this.passedLinks[id]; // Reset
            this.matchedTraces[id] = [];
        }

        if (!this.matchedTraces[id]) this.matchedTraces[id] = [];
        this.matchedTraces[id].push(snappedPoint);

        // Check Coverage
        if (this.checkCoverage(feature, this.matchedTraces[id], overlapRatio)) {
            this.handlePass(feature, id);
        }
    }

    checkCoverage(feature, points, threshold) {
        // Strategy: Get min and max index along the line
        // Turf nearestPointOnLine returns `properties.location` (distance along line in km?) 
        // or `properties.index`.
        // Actually nearestPointOnLine result properties have `location` (dist from start).
        
        if (points.length < 2) return false;
        
        const locs = points.map(p => p.properties.location);
        const minLoc = Math.min(...locs);
        const maxLoc = Math.max(...locs);
        
        // Total length
        const turfLine = this.format.writeFeatureObject(feature);
        const totalLen = turf.length(turfLine, { units: 'kilometers' }); // verify units of 'location'
        // turf location is usually in the units specified or defaults. nearestPointOnLine units default is km.
        
        if (totalLen === 0) return false;
        
        const covered = (maxLoc - minLoc);
        return (covered / totalLen) >= threshold;
    }

    handlePass(feature, id) {
        console.log(`PASS DETECTED for link ${id}`);
        // Action: Update Column
        const key = layerManager.targetKey;
        const mode = settings.get('algorithm.mode');
        
        if (key) {
            let val = feature.get(key);
            // Parse Int
            val = parseInt(val, 10);
            if (isNaN(val)) val = 0; // Default if missing
            
            if (mode === 'inc') val++;
            else val--;
            
            feature.set(key, val);
            
            // Visual feedback?
             // Refresh styles might be needed if style depends on attribute
             feature.changed();
        }
        
        // Mark as passed
        this.passedLinks[id] = Date.now();
        
        // Send WS update
        // "gps정보, target_link와 매칭된 key값, 조사 status, 이벤트 로그"
        const event = new CustomEvent('linkPassed', { detail: { id, key, value: feature.get(key) } });
        document.dispatchEvent(event);
    }
}

export const algorithmManager = new AlgorithmManager();

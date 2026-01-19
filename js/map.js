
const MAP = {
    view: null,
    map: null,
    gpsLayer: null,
    gpsSource: null,
    cursorFeature: null,

    init() {
        this.view = new ol.View({ center: ol.proj.fromLonLat([127, 37.5]), zoom: 14 });

        // GPS Trail/Cursor Layer
        this.gpsSource = new ol.source.Vector();
        this.gpsLayer = new ol.layer.Vector({
            source: this.gpsSource,
            zIndex: 999 
        });

        this.map = new ol.Map({ 
            target: 'map', 
            layers: [
                new ol.layer.Tile({ source: new ol.source.OSM() }),
                this.gpsLayer
            ], 
            view: this.view, 
            controls: [] 
        });

        // Init Cursor Feature
        this.cursorFeature = new ol.Feature();
        // Initial Style (System OFF -> Red)
        this.cursorFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({color: '#ff1744'}),
                stroke: new ol.style.Stroke({color: '#fff', width: 2})
            })
        }));
        this.gpsSource.addFeature(this.cursorFeature);
    },

    updateGPSVisuals(pos) {
        if(!this.cursorFeature) return;
        const coord = ol.proj.fromLonLat(pos);
        this.cursorFeature.setGeometry(new ol.geom.Point(coord));

        let color = '#ff1744'; // Default Red (System OFF)
        
        if (APP.state === 'RUNNING') {
            color = APP.matching ? '#00e676' : '#9e9e9e'; // Green or Gray
            
            // Add to Trail
            const trailDot = new ol.Feature({geometry: new ol.geom.Point(coord)});
            trailDot.setStyle(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 4,
                    fill: new ol.style.Fill({color: color})
                    // No stroke for trail to keep it lighter? Or minimal stroke.
                })
            }));
            this.gpsSource.addFeature(trailDot);
        }

        // Update Cursor Style to match state or keep Red?
        // User mainly asked for Red Dot when System OFF.
        // It's cleaner if Cursor reflects current mode.
        this.cursorFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({color: color}),
                stroke: new ol.style.Stroke({color: '#fff', width: 2})
            })
        }));
    },

    forceCenter() { if(GPS.pos) this.view.animate({center: ol.proj.fromLonLat(GPS.pos), duration:300}); }
};

const LAYER = {
    list: [], target: null, editId: null, showLabels: false,
    
    async add() {
        UI.toast('Loading...');
        const t = document.getElementById('l-type').value;
        
        try {
            let feats = [];
            
            // WFS / WMS Logic (Mock for now, or simple WFS fetch)
            if(t === 'wfs') {
                 const url = document.getElementById('l-url').value; // e.g. http://site/geoserver/wfs
                 const params = document.getElementById('l-param').value; // e.g. typename=topp:states
                 if(!url || !params) throw new Error('Missing URL/Params');
                 
                 // Construct WFS GetFeature URL
                 // Ideally: url + ?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json& + params
                 const fetchUrl = `${url}?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json&${params}`;
                 
                 const res = await fetch(fetchUrl);
                 if(!res.ok) throw new Error('Fetch Failed');
                 const json = await res.json();
                 feats = new ol.format.GeoJSON().readFeatures(json);
                 
            } else if(t === 'wms') {
                 UI.toast('WMS Image Layer Added');
                 const url = document.getElementById('l-url').value;
                 const params = document.getElementById('l-param').value; // e.g. LAYERS=topp:states
                 if(!url || !params) throw new Error('Missing URL/Params');
                 
                 // WMS is Image/Tile layer, not Vector
                 const wmsSource = new ol.source.TileWMS({
                     url: url,
                     params: {'LAYERS': params.split('=')[1] || params, 'TILED': true},
                     serverType: 'geoserver',
                     transition: 0
                 });
                 const lyr = new ol.layer.Tile({ source: wmsSource });
                 const id = Date.now().toString();
                 lyr.set('id', id); MAP.map.addLayer(lyr);
                 this.list.push({id, name: 'WMS: '+params, layer: lyr, type: t, file: null, proj: 'EPSG:3857', style: null});
                 UI.toast('WMS Added'); UI.popView();
                 return; // Exit as it's not a vector layer
            } else {
                // GeoJSON / SHP
                const f = document.getElementById('l-file').files[0];
                if(!f) return;
                
                if(t === 'geojson') feats = new ol.format.GeoJSON().readFeatures(await f.text());
                else feats = new ol.format.GeoJSON().readFeatures(await shp(await f.arrayBuffer()));
            }

            if(!feats.length) { UI.toast('No Features', 'warn'); return; }

            // Common Vector Logic
            feats.forEach(ft => ft.getGeometry().transform('EPSG:4326', 'EPSG:3857'));
            const src = new ol.source.Vector({features: feats});
            const lyr = new ol.layer.Vector({source: src, style: this.defStyle()});
            const id = Date.now().toString();
            
            lyr.set('id', id); MAP.map.addLayer(lyr);
            // Default name for Service
            let name = (t.includes('web')) ? document.getElementById('l-param').value : document.getElementById('l-file').files[0]?.name || 'Layer';
            
            this.list.push({id, name: name, layer: lyr, type: t, file: document.getElementById('l-file').files[0], proj: 'EPSG:4326', style: {c: '#f00', w: 3}});
            
            MAP.view.fit(src.getExtent(), {padding: [50,50,50,50], duration: 500});
            UI.toast('Layer Added'); UI.popView();
            
        } catch(e) { console.error(e); UI.toast('Load Error: ' + e.message, 'error'); }
    },
    
    refreshList() {
        const c = document.getElementById('l-list-cont'); c.innerHTML = '';
        if(!this.list.length) c.innerHTML = '<p style="text-align:center;color:#666">No Layers</p>';
        this.list.forEach(l => {
            const r = document.createElement('div'); r.className = 'layer-item';
            r.innerHTML = `<div><b style="color:#fff">${l.name}</b><br><small style="color:#888">${l.proj}</small></div>
            <div class="icon-actions">
            ${ (l.type !== 'wms') ? `<button class="icon-btn" onclick="LAYER.toStyle('${l.id}')"><i class="fas fa-palette"></i></button>` : '' }
            ${ (l.type !== 'wms') ? `<button class="icon-btn" onclick="LAYER.toProj('${l.id}')"><i class="fas fa-globe"></i></button>` : '' }
            <button class="icon-btn" onclick="LAYER.toggle('${l.id}')"><i class="fas fa-eye"></i></button>
            <button class="icon-btn" onclick="LAYER.remove('${l.id}')" style="color:#ef5350"><i class="fas fa-trash"></i></button></div>`;
            c.appendChild(r);
        });
        const tSel = document.getElementById('t-layer');
        tSel.innerHTML = '<option value="">Select Layer...</option>';
        this.list.forEach(l => { if(l.type !== 'wms') tSel.appendChild(new Option(l.name, l.id)); });
        
        tSel.onchange = (e) => {
            const l = this.list.find(x => x.id === e.target.value);
            if(l) { 
                const k = l.layer.getSource().getFeatures()[0].getKeys();
                const ks = document.getElementById('t-key'), cs = document.getElementById('t-check'); 
                ks.innerHTML = ''; cs.innerHTML = '';
                k.forEach(ky => {
                    if(ky !== 'geometry') {
                        ks.appendChild(new Option(ky, ky)); 
                        cs.appendChild(new Option(ky, ky));
                    }
                });
            }
        };
    },
    
    toStyle(id) { this.editId = id; document.getElementById('st-name').innerText = this.list.find(x => x.id === id).name; UI.pushView('Edit Style', 'tpl-style'); },
    
    applyStyle() {
        const c = document.getElementById('st-color').value, w = document.getElementById('st-width').value;
        const l = this.list.find(x => x.id === this.editId);
        l.layer.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({color: c, width: parseInt(w)}), 
            image: new ol.style.Circle({radius: 6, fill: new ol.style.Fill({color: c})})
        }));
        l.style = {c, w}; UI.toast('Style Applied'); UI.popView();
    },
    
    toProj(id) { this.editId = id; document.getElementById('pr-curr').innerText = this.list.find(x => x.id === id).proj; UI.pushView('Reprojection', 'tpl-proj'); },
    
    async applyProj() {
        const to = document.getElementById('pr-sel').value; const l = this.list.find(x => x.id === this.editId);
        if(!l.file) return; UI.toast('Reprojecting...');
        try {
            let f = []; 
            if(l.type === 'geojson') f = new ol.format.GeoJSON().readFeatures(await l.file.text()); 
            else f = new ol.format.GeoJSON().readFeatures(await shp(await l.file.arrayBuffer()));
            
            f.forEach(ft => ft.getGeometry().transform(to, 'EPSG:3857'));
            l.layer.setSource(new ol.source.Vector({features: f})); l.proj = to;
            MAP.view.fit(l.layer.getSource().getExtent(), {padding: [50,50,50,50], duration: 500}); UI.toast('Done'); UI.popView();
        } catch(e) { UI.toast('Error', 'error'); }
    },
    
    toggle(id) { const l = this.list.find(x => x.id === id); if(l) l.layer.setVisible(!l.layer.getVisible()); },
    
    remove(id) { const i = this.list.findIndex(x => x.id === id); if(i >= 0){ MAP.map.removeLayer(this.list[i].layer); this.list.splice(i, 1); this.refreshList(); } },
    
    saveTarget() {
        const lid = document.getElementById('t-layer').value;
        const k = document.getElementById('t-key').value;
        let c = document.getElementById('t-check').value;
        if(!document.getElementById('t-check-new').classList.contains('hidden')) c = document.getElementById('t-check-new').value;
        
        if(!lid || !k) { UI.toast('Missing Info', 'error'); return; }
        
        const l = this.list.find(x => x.id === lid);
        APP.config.target = { layerId: lid, key: k, check: c, init: parseInt(document.getElementById('t-init').value) };
        this.target = { source: l.layer.getSource(), ...APP.config.target };
        
        this.target.source.getFeatures().forEach(f => { if(f.get(c) === undefined) f.set(c, APP.config.target.init); });
        
        // Use Layer's Styled Width + 2 for highlight, or default 6
        // This ensures thick lines if the user set them to be thick
        const w = (l.style && l.style.w) ? (parseInt(l.style.w) + 2) : 6;
        
        l.layer.setStyle(f => {
            const v = f.get(c); 
            // Visibility Logic: 0 -> Invisible
            if (v === 0) return null;

            // Color Palette
            // 1: Cyan (#00BCD4), 2: Green (#00e676), 3: Yellow (#ffea00), 4: Orange (#ff9100), 5+: Red (#ff1744)
            let cl = '#7e57c2'; // Default/Fallback (Purple)
            if (v == 1) cl = '#00BCD4';
            else if (v == 2) cl = '#00e676';
            else if (v == 3) cl = '#ffea00';
            else if (v == 4) cl = '#ff9100';
            else if (v >= 5) cl = '#ff1744';
            else if (v < 0) cl = '#ef5350'; // Negative (Error?)

            const s = [new ol.style.Style({
                stroke: new ol.style.Stroke({color: cl, width: w})
            })];

            // Label Logic
            if (this.showLabels) {
                const txt = f.get(k) ? String(f.get(k)) : '';
                s.push(new ol.style.Style({
                    text: new ol.style.Text({
                        text: txt,
                        font: 'bold 13px sans-serif',
                        fill: new ol.style.Fill({color: '#fff'}),
                        stroke: new ol.style.Stroke({color: '#000', width: 3}),
                        overflow: true,
                        offsetY: -10
                    })
                }));
            }
            return s;
        });
        UI.toast('Target Linked');
    },

    toggleLabels() {
        this.showLabels = !this.showLabels;
        const btn = document.getElementById('btn-toggle-labels');
        if(btn) btn.innerText = `Toggle Labels: ${this.showLabels ? 'ON' : 'OFF'}`;
        
        // Refresh Style of Target Layer if exists
        if (APP.config.target.layerId) {
            const l = this.list.find(x => x.id === APP.config.target.layerId);
            if(l) l.layer.changed();
        }
    },
    
    defStyle() { return new ol.style.Style({stroke: new ol.style.Stroke({color: 'yellow', width: 3}), image: new ol.style.Circle({radius: 5, fill: new ol.style.Fill({color: 'yellow'})})}); }
};

const GPS = {
    pos: null,
    start() { 
        navigator.geolocation.watchPosition(p => {
            this.pos = [p.coords.longitude, p.coords.latitude];
            const el = document.getElementById('gps-val');
            if(el) { el.innerText = 'FIX'; el.style.color = '#00e676'; }
            
            // Auto Pan if not interacting
            if(MAP.view && !MAP.view.getInteracting()) MAP.view.animate({center: ol.proj.fromLonLat(this.pos), duration: 200});
            
            // Update Visuals (Red/Green/Gray Dots)
            MAP.updateGPSVisuals(this.pos);

            if(APP.state === 'RUNNING') APP.gpsLog.push(this.pos);
            if(APP.state === 'RUNNING' && APP.matching) {
                // Algorithm Hook
            }
        }, e => {}, {enableHighAccuracy: true});
    },
    isFixed() { return !!this.pos; }
};

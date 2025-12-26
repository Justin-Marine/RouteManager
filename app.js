/**
 * Route Manager V1.3
 */
const App = {
    Config: {
        data: {
            interpStep: 0.25, searchRadius: 12.5, overlapRatio: 0.9, bufferRadius: 1.0,
            mode: 'dec', targetField: 'target_cnt', defaultValue: 1, wsUrl: 'wss://echo.websocket.org'
        },
        init() {
            const saved = localStorage.getItem('RM_Config_V2');
            if (saved) this.data = { ...this.data, ...JSON.parse(saved) };
        },
        save() { localStorage.setItem('RM_Config_V2', JSON.stringify(this.data)); },
        saveFromUI() {
            this.data.interpStep = parseFloat(document.getElementById('cfg-interp').value);
            this.data.searchRadius = parseFloat(document.getElementById('cfg-dist').value);
            this.data.overlapRatio = parseFloat(document.getElementById('cfg-overlap').value);
            this.data.mode = document.getElementById('cfg-mode').value;
            this.data.targetField = document.getElementById('cfg-field').value;
            this.data.defaultValue = parseInt(document.getElementById('cfg-defval').value);
            this.data.wsUrl = document.getElementById('cfg-ws').value;
            this.save();
            if (App.Layers.targetId) App.Layers.applyTargetStyle(App.Layers.targetId);
            alert("저장되었습니다.");
            App.UI.closeSettings();
        },
        exportSettings() {
            const packet = { config: this.data, layers: App.Layers.list.map(l => { const {data, ...meta} = l; return meta; }) };
            const blob = new Blob([JSON.stringify(packet, null, 2)], {type: "application/json"});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `rm_settings_${Date.now()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        },
        importSettings(input) {
            const file = input.files[0];
            if(!file) return;
            const r = new FileReader();
            r.onload = e => {
                try {
                    const packet = JSON.parse(e.target.result);
                    if(packet.config) this.data = packet.config;
                    if(packet.layers) { App.Layers.list = []; packet.layers.forEach(l => App.Layers.addLayer(l)); }
                    this.save(); App.Layers.save();
                    alert("설정 로드 완료. 새로고침합니다."); location.reload();
                } catch(err) { alert("파일 오류"); }
            };
            r.readAsText(file);
        },
        clearAll() { if(confirm("초기화?")) { localStorage.clear(); location.reload(); } }
    },

    State: { isSurveying: false, lastGps: null, currentMatchId: null, wsConnected: false, traceMemory: {}, visitHistory: {}, gpsLog: [] },

    Layers: {
        list: [], targetId: null,
        init() {
            const saved = localStorage.getItem('RM_Layers_V2');
            if (saved) this.list = JSON.parse(saved);
            else this.addLayer({ id: 'osm-base', type: 'raster', name: 'OpenStreetMap', visible: true, url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png' });
        },
        save() {
            const toSave = this.list.map(l => { const { data, ...meta } = l; return meta; });
            localStorage.setItem('RM_Layers_V2', JSON.stringify(toSave));
        },
        addLayer(l) { if(!this.list.find(x => x.id === l.id)) this.list.push(l); this.addToMap(l); this.save(); App.UI.renderLayerLists(); },
        removeLayer(id) {
            if (id === 'osm-base') return;
            if (App.Map.instance.getLayer(id)) App.Map.instance.removeLayer(id);
            if (App.Map.instance.getSource(id)) App.Map.instance.removeSource(id);
            if (this.targetId === id) { if (App.Map.instance.getLayer('target-viz')) App.Map.instance.removeLayer('target-viz'); this.targetId = null; }
            this.list = this.list.filter(l => l.id !== id);
            this.save(); App.UI.renderLayerLists();
        },
        setTarget(id) {
            const layer = this.list.find(l => l.id === id);
            if (!layer || layer.type !== 'geojson') return;
            this.list.forEach(l => l.isTarget = false); layer.isTarget = true; this.targetId = id;
            if (layer.data) { this.ensureFields(layer.data); App.Map.instance.getSource(id).setData(layer.data); }
            this.applyTargetStyle(id); this.save(); App.UI.renderLayerLists();
        },
        ensureFields(geojson) {
            const field = App.Config.data.targetField;
            const def = App.Config.data.defaultValue;
            geojson.features.forEach(f => { if (f.properties[field] === undefined) f.properties[field] = def; });
        },
        addToMap(l) {
            const map = App.Map.instance;
            if (map.getSource(l.id)) return;
            if (l.type === 'raster') {
                map.addSource(l.id, { type: 'raster', tiles: [l.url], tileSize: 256 });
                map.addLayer({ id: l.id, type: 'raster', source: l.id, layout: { visibility: l.visible ? 'visible' : 'none' } }, 'target-bg');
            } else if (l.type === 'geojson') {
                if (!l.data && l.url) { fetch(l.url).then(r => r.json()).then(json => { l.data = json; this.addToMap(l); }); return; }
                if (!l.data) return;
                map.addSource(l.id, { type: 'geojson', data: l.data });
                map.addLayer({ id: l.id, type: 'line', source: l.id, layout: { 'line-cap': 'round', 'line-join': 'round', visibility: l.visible ? 'visible' : 'none' }, paint: { 'line-width': 6, 'line-color': '#888', 'line-opacity': 0.4 } });
                if (l.isTarget) { this.targetId = l.id; this.ensureFields(l.data); this.applyTargetStyle(l.id); }
            }
        },
        applyTargetStyle(sourceId) {
            const map = App.Map.instance;
            if (map.getLayer('target-viz')) map.removeLayer('target-viz');
            const field = App.Config.data.targetField;
            map.addLayer({
                id: 'target-viz', type: 'line', source: sourceId,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-width': 5,
                    'line-color': ['match', ['get', field], 1, '#34c759', 2, '#ffcc00', 3, '#ff3b30', '#007aff'],
                    'line-opacity': ['case', ['>', ['get', field], 0], 0.6, 0.0]
                }
            });
        },
        addNewLayerFromUI() {
            const type = document.getElementById('add-type').value;
            const name = document.getElementById('add-name').value;
            if (!name) return alert("이름 입력");
            const newId = 'L' + Date.now();
            let obj = { id: newId, name: name, visible: true, isTarget: false };
            if (type === 'geojson_file') {
                const f = document.getElementById('add-file').files[0];
                if (!f) return alert("파일 선택");
                const r = new FileReader();
                r.onload = e => {
                    obj.type = 'geojson'; obj.data = JSON.parse(e.target.result);
                    this.addLayer(obj);
                    const bbox = turf.bbox(obj.data);
                    App.Map.instance.fitBounds(bbox, {padding:50});
                    if(!this.targetId) this.setTarget(newId);
                };
                r.readAsText(f);
            } else {
                obj.url = document.getElementById('add-url').value;
                obj.type = (type === 'raster') ? 'raster' : 'geojson';
                this.addLayer(obj);
            }
        },
        toggleVis(id, v) {
            const l = this.list.find(x=>x.id===id); if(l) l.visible = v;
            if(App.Map.instance.getLayer(id)) App.Map.instance.setLayoutProperty(id, 'visibility', v?'visible':'none');
            if(id===this.targetId && App.Map.instance.getLayer('target-viz')) App.Map.instance.setLayoutProperty('target-viz', 'visibility', v?'visible':'none');
            this.save();
        }
    },

    Map: {
        instance: null,
        init() {
            this.instance = new maplibregl.Map({
                container: 'map',
                style: { version: 8, sources: {}, layers: [] },
                center: [126.9778, 37.5663], zoom: 17
            });
            this.instance.on('load', () => {
                this.instance.addSource('user_pos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                this.instance.addLayer({ id: 'user-marker', type: 'circle', source: 'user_pos', paint: { 'circle-radius': 8, 'circle-color': '#8e8e93', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
                App.Layers.init();
                App.Layers.list.forEach(l => App.Layers.addToMap(l));
                App.Engine.startGps();
                this.centerUser();
            });
        },
        updateMarker(pt, active) {
            this.instance.setPaintProperty('user-marker', 'circle-color', active ? '#34c759' : '#8e8e93');
            this.instance.getSource('user_pos').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: pt } }] });
        },
        centerUser() {
            if (App.State.lastGps) this.instance.flyTo({ center: [App.State.lastGps.lng, App.State.lastGps.lat], zoom: 18 });
            else navigator.geolocation.getCurrentPosition(p=>this.instance.flyTo({center:[p.coords.longitude,p.coords.latitude],zoom:18}), e=>console.log("No Geo"));
        }
    },

    Engine: {
        wsSocket: null,
        startGps() {
            if (!navigator.geolocation) return;
            navigator.geolocation.watchPosition(pos => {
                const { longitude, latitude, accuracy, speed, heading } = pos.coords;
                App.State.lastGps = { lng: longitude, lat: latitude, speed: speed||0, heading: heading||0 };
                document.getElementById('st-gps').innerText = `±${Math.round(accuracy)}m`;
                App.Map.updateMarker([longitude, latitude], App.State.isSurveying);
                if (App.State.isSurveying) this.processMatching([longitude, latitude]);
            }, e => console.error(e), { enableHighAccuracy: true });
            setInterval(() => this.sendWs(), 1000);
        },
        toggleSurvey() {
            App.State.isSurveying = !App.State.isSurveying;
            App.UI.updateSurveyBtn();
        },
        processMatching(pt) {
            const layerId = App.Layers.targetId;
            if (!layerId) return;
            const layer = App.Layers.list.find(l => l.id === layerId);
            if (!layer || !layer.data) return;
            const cfg = App.Config.data;
            const ptGeo = turf.point(pt);
            let bestId = null, minDist = Infinity;
            layer.data.features.forEach(f => {
                const snapped = turf.nearestPointOnLine(f, ptGeo);
                const dist = turf.distance(ptGeo, snapped, {units: 'kilometers'}) * 1000;
                if (dist < cfg.searchRadius && dist < minDist) { minDist = dist; bestId = f.properties.id || f.id; }
            });
            App.State.currentMatchId = bestId; 
            document.getElementById('st-match').innerText = bestId ? `ID: ${bestId}` : "-";
            if (bestId) this.updateTrace(layerId, bestId, pt);
        },
        updateTrace(layerId, linkId, pt) {
            const key = `${layerId}-${linkId}`;
            if (!App.State.traceMemory[key]) App.State.traceMemory[key] = [];
            const mem = App.State.traceMemory[key];
            if (mem.length > 200) mem.shift();
            mem.push(pt);
            if (mem.length < 2) return;
            try {
                const cfg = App.Config.data;
                const line = turf.lineString(mem);
                const tBuf = turf.buffer(turf.simplify(line, {tolerance:0.00001}), cfg.bufferRadius/1000, {units:'kilometers'});
                const layer = App.Layers.list.find(l => l.id === layerId);
                const lFeat = layer.data.features.find(f => (f.properties.id == linkId || f.id == linkId));
                const lBuf = turf.buffer(lFeat, cfg.bufferRadius/1000, {units:'kilometers'});
                if (turf.area(turf.intersect(tBuf, lBuf)) / turf.area(lBuf) >= cfg.overlapRatio) this.handlePass(layer, lFeat);
            } catch(e) {}
        },
        handlePass(layer, feature) {
            const key = `${layer.id}-${feature.properties.id}`;
            const now = Date.now();
            if (App.State.visitHistory[key] && (now - App.State.visitHistory[key]) < 5000) return;
            App.State.visitHistory[key] = now;
            const cfg = App.Config.data;
            let val = feature.properties[cfg.targetField] || 0;
            if (cfg.mode === 'dec') { val--; if(val<0) val=0; } else val++;
            feature.properties[cfg.targetField] = val;
            App.Map.instance.getSource(layer.id).setData(layer.data);
        },
        toggleWS() {
            if (App.State.wsConnected) { App.State.wsSocket.close(); App.State.wsConnected = false; }
            else {
                try {
                    App.State.wsSocket = new WebSocket(App.Config.data.wsUrl);
                    App.State.wsSocket.onopen = () => { App.State.wsConnected = true; alert("WS Connected"); };
                    App.State.wsSocket.onclose = () => { App.State.wsConnected = false; };
                } catch(e) { alert("WS Fail"); }
            }
            App.UI.updateWsBtn();
        },
        sendWs() {
            if (App.State.wsConnected && App.State.lastGps) {
                const pl = { ...App.State.lastGps, surveying: App.State.isSurveying, matched_link_id: App.State.currentMatchId, ts: Date.now() };
                App.State.wsSocket.send(JSON.stringify(pl));
            }
        },
        sendEventPayload(type, data) {
            if (App.State.wsConnected && App.State.lastGps) {
                const pl = { type: 'event', eventType: type, eventData: data, loc: App.State.lastGps, linkId: App.State.currentMatchId, ts: Date.now() };
                App.State.wsSocket.send(JSON.stringify(pl));
                alert("이벤트 전송됨");
            } else alert("서버 미연결");
        }
    },

    Event: {
        videoStream: null,
        toggleMenu() {
            document.getElementById('event-sub-menu').classList.toggle('open');
            document.getElementById('btn-event-toggle').classList.toggle('active');
        },
        sendText(txt) { App.Engine.sendEventPayload('text', txt); this.toggleMenu(); },
        async startCamera() {
            this.toggleMenu();
            const video = document.getElementById('camera-view');
            document.getElementById('camera-overlay').classList.add('active');
            try {
                this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                video.srcObject = this.videoStream;
            } catch(e) { alert("카메라 오류"); this.closeCamera(); }
        },
        captureAndSend() {
            const video = document.getElementById('camera-view');
            const canvas = document.getElementById('camera-canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.6);
            App.Engine.sendEventPayload('image', base64);
            this.closeCamera();
        },
        closeCamera() {
            if(this.videoStream) this.videoStream.getTracks().forEach(t=>t.stop());
            document.getElementById('camera-overlay').classList.remove('active');
        }
    },

    UI: {
        openSettings() { 
            document.getElementById('settings-view').classList.add('active');
            const d = App.Config.data;
            document.getElementById('cfg-interp').value = d.interpStep;
            document.getElementById('cfg-dist').value = d.searchRadius;
            document.getElementById('cfg-overlap').value = d.overlapRatio;
            document.getElementById('cfg-mode').value = d.mode;
            document.getElementById('cfg-field').value = d.targetField;
            document.getElementById('cfg-defval').value = d.defaultValue;
            document.getElementById('cfg-ws').value = d.wsUrl;
        },
        closeSettings() { document.getElementById('settings-view').classList.remove('active'); },
        switchTab(id) {
            document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active'); document.getElementById(id).classList.add('active');
        },
        toggleLayerPopover() {
            const el = document.getElementById('layer-popover');
            el.classList.toggle('visible');
            this.renderLayerLists();
        },
        toggleAddForm() {
            const t = document.getElementById('add-type').value;
            const f = document.getElementById('form-url');
            if(t.includes('file')) f.innerHTML = '<input type="file" id="add-file" accept=".geojson,.json" class="btn btn-secondary">';
            else f.innerHTML = '<input type="text" id="add-url" placeholder="URL...">';
        },
        updateSurveyBtn() {
            const b = document.getElementById('btn-survey');
            const s = document.getElementById('st-mode');
            if(App.State.isSurveying) { b.innerText="Stop Survey"; b.classList.add('active'); s.innerText="Active"; s.classList.add('active'); }
            else { b.innerText="Start Survey"; b.classList.remove('active'); s.innerText="Inactive"; s.classList.remove('active'); }
        },
        updateWsBtn() {
            const b = document.getElementById('btn-ws');
            if(App.State.wsConnected) { b.innerText="연결 종료"; b.classList.replace('btn-secondary','btn-primary'); }
            else { b.innerText="연결 시작"; b.classList.replace('btn-primary','btn-secondary'); }
        },
        renderLayerLists() {
            const mList = document.getElementById('manage-list'); mList.innerHTML = '';
            App.Layers.list.forEach(l => {
                if(l.id==='osm-base') return;
                const isT = l.id === App.Layers.targetId;
                mList.innerHTML += `<div class="layer-manage-item"><div class="layer-header"><span style="font-weight:600;">${l.name}</span><div>${isT?'<span class="tag target">TARGET</span>':''}<span class="tag">${l.type}</span></div></div><div style="display:flex; gap:5px;">${l.type==='geojson'?`<button class="btn btn-primary" style="margin:0; padding:8px; font-size:12px; flex:2;" onclick="App.Layers.setTarget('${l.id}')">Target</button>`:''}<button class="btn btn-danger" style="margin:0; padding:8px; font-size:12px; flex:1;" onclick="App.Layers.removeLayer('${l.id}')">삭제</button></div></div>`;
            });
            const pList = document.getElementById('popover-list'); pList.innerHTML = '';
            App.Layers.list.forEach(l => {
                pList.innerHTML += `<div class="layer-row"><span class="layer-label">${l.name}${l.id===App.Layers.targetId?' (T)':''}</span><input type="checkbox" ${l.visible?'checked':''} onchange="App.Layers.toggleVis('${l.id}', this.checked)"></div>`;
            });
        },
        toggleVis(id, v) { App.Layers.toggleVis(id, v); }
    }
};

// Main Entry Point (Safe Init)
document.addEventListener('DOMContentLoaded', () => {
    App.Config.init();
    App.Map.init();
});
</script>
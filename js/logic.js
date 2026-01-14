
const APP_LOGIC = {
    checkStart() {
        if(!APP.config.survey.name) { UI.toast('Name Required', 'error'); UI.pushView('Settings', 'tpl-settings', () => UI.popSettings()); return false; }
        if(!LAYER.target) { UI.toast('Target Required', 'error'); return false; }
        if(!GPS.isFixed()) UI.toast('Wait GPS', 'warn');
        return true;
    },
    
    saveSurvey() { APP.config.survey.name = document.getElementById('s-name').value; UI.toast('Name Saved'); },
    
    saveAlgo() {
        APP.config.algo.mode = document.getElementById('a-mode').value;
        APP.config.algo.radius = parseFloat(document.getElementById('a-rad').value);
        APP.config.algo.interp = parseFloat(document.getElementById('a-interp').value);
        APP.config.algo.overlap = parseFloat(document.getElementById('a-overlap').value);
        UI.toast('Algo Params Saved');
    },
    
    connectWS() {
        const url = document.getElementById('s-ws').value;
        APP.config.survey.ws = url;
        try { 
            if(APP.ws) APP.ws.close();
            APP.ws = new WebSocket(url); 
            APP.ws.onopen = () => UI.toast('Connected!');
            APP.ws.onerror = () => UI.toast('Connection Failed', 'error');
        } catch(e) { UI.toast('Invalid URL', 'error'); }
    },
    
    sendWS(d) { if(APP.ws && APP.ws.readyState === 1) APP.ws.send(JSON.stringify(d)); },
    
    sendStatus() { this.sendWS({type: 'status', ...APP}); },
    
    logEvent(e) { this.sendWS({type: 'event', val: e, pos: GPS.pos}); },
    
    exportGPS() {
        if(!APP.gpsLog.length) { UI.toast('No GPS Data', 'warn'); return; }
        const gj = {
            type: 'FeatureCollection', 
            features: APP.gpsLog.map(p => ({
                type: 'Feature', 
                geometry: {type: 'Point', coordinates: p}, 
                properties: {time: Date.now()}
            }))
        };
        const blob = new Blob([JSON.stringify(gj)], {type: 'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gps_log_${Date.now()}.geojson`; a.click();
    },
    
    saveConfig() {
        const blob = new Blob([JSON.stringify(APP.config, null, 2)], {type: 'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spatial_config.json'; a.click();
    },
    
    async loadConfig(input) {
        const f = input.files[0];
        if(!f) return;
        try {
            const txt = await f.text();
            APP.config = JSON.parse(txt);
            UI.toast('Config Loaded');
            UI.popSettings(); 
        } catch(e) { UI.toast('Invalid JSON', 'error'); }
    }
};

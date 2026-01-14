
import { mapManager } from './map.js';
import { layerManager } from './layers.js';
import { settings } from './settings.js';
import { algorithmManager } from './algorithm.js';
import { gpsManager } from './gps.js';
import { ui } from './ui.js';
import 'ol/ol.css';
import 'toastify-js/src/toastify.css';

class App {
    constructor() {
        this.state = 'OFF'; // OFF, READY, RUNNING
        this.isMatching = false;
        this.stripSeq = 0;
        this.gpsStatus = 'Waiting...';
        this.ws = null;
    }

    async init() {
        console.log("Initializing App...");
        
        mapManager.init();
        ui.init();
        
        // Listeners
        this.setupLayerListeners();
        this.setupSettingsListeners();
        this.setupControlListeners();
        this.setupGps();
        this.setupAlgorithmEvents();
        
        // Connect WS if configured
        this.connectWs();
    }

    setupLayerListeners() {
        // File Input
        const fileInput = document.getElementById('layer-file-input');
        const addBtn = document.getElementById('add-layer-btn');
        
        addBtn.addEventListener('click', async () => {
            const type = document.getElementById('layer-type-select').value;
            const urlInput = document.getElementById('layer-url-input');
            
            if (type === 'wfs') {
                layerManager.addWFS(urlInput.value, 'WFS Layer');
            } else if (type === 'wms') {
                layerManager.addWMS(urlInput.value, 'WMS Layer', '0'); // '0' is dummy layer param
            } else {
                // Local file
                if (fileInput.files.length > 0) {
                    await layerManager.loadLocalFile(fileInput.files[0], type);
                } else {
                    fileInput.click(); // Open system dialog
                    // wait for change? Simple trick:
                    fileInput.onchange = async () => {
                        if (fileInput.files.length > 0) {
                             await layerManager.loadLocalFile(fileInput.files[0], type);
                             ui.toast('Layer Loaded');
                        }
                    };
                }
            }
        });
        
        // Layer List Update
        document.addEventListener('layersUpdated', (e) => {
            const list = document.getElementById('layer-list');
            const targetSelect = document.getElementById('target-layer-select');
            
            list.innerHTML = '';
            targetSelect.innerHTML = '<option value="">Select Target Layer...</option>';
            
            e.detail.forEach(l => {
                // List Item
                const item = document.createElement('div');
                item.className = 'glass-panel';
                item.style.padding = '10px';
                item.style.marginBottom = '5px';
                item.innerText = `${l.name} (${l.type})`;
                list.appendChild(item);
                
                // Target Option
                if (['geojson', 'wfs', 'shp'].includes(l.type)) {
                    const opt = document.createElement('option');
                    opt.value = l.id;
                    opt.innerText = l.name;
                    targetSelect.appendChild(opt);
                }
            });
        });
        
        // Target Select Logic
        document.getElementById('target-layer-select').addEventListener('change', (e) => {
            const id = e.target.value;
            const cols = layerManager.getAvailableColumns(id);
            const keySelect = document.getElementById('target-key-select');
            keySelect.innerHTML = '<option value="">Select Key Column...</option>';
            cols.forEach(c => {
                 const opt = document.createElement('option');
                 opt.value = c;
                 opt.innerText = c;
                 keySelect.appendChild(opt);
            });
        });
        
        document.getElementById('target-key-select').addEventListener('change', (e) => {
             const layerId = document.getElementById('target-layer-select').value;
             if (layerId && e.target.value) {
                 if (layerManager.setTarget(layerId, e.target.value)) {
                     settings.set('algorithm.targetLayerName', layerId); // Store ID preferably
                     settings.set('algorithm.targetKeyColumn', e.target.value);
                     ui.toast('Target Linked Set');
                 }
             }
        });
    }

    setupSettingsListeners() {
        document.getElementById('save-algo-btn').addEventListener('click', () => {
            settings.set('algorithm.bufferRadius', parseFloat(document.getElementById('algo-buffer').value));
            settings.set('algorithm.interpolationStep', parseFloat(document.getElementById('algo-interp').value));
            settings.set('algorithm.overlapRatio', parseFloat(document.getElementById('algo-overlap').value));
            // Mode
            const mode = document.querySelector('input[name="op-mode"]:checked').value;
            settings.set('algorithm.mode', mode);
            ui.toast('Algorithm params saved');
        });
        
        document.getElementById('save-config-btn').addEventListener('click', () => settings.saveConfig());
        document.getElementById('ws-connect-btn').addEventListener('click', () => {
            settings.set('survey.wsUrl', document.getElementById('ws-url').value);
            this.connectWs();
        });
    }

    setupControlListeners() {
        // Map Center
        document.getElementById('btn2_mapcenter').addEventListener('click', () => {
             mapManager.forceCenter();
        });

        // Func Button
        ui.bindFuncButton(
            // Short Click
            () => {
                if (this.state === 'RUNNING') {
                    // Toggle Matching
                    this.isMatching = !this.isMatching;
                    ui.updateStatus('strip', this.isMatching);
                    if (this.isMatching) {
                        this.stripSeq++;
                        ui.updateStatus('seq', this.stripSeq);
                        ui.toast('Strip ON');
                    } else {
                        ui.toast('Strip OFF');
                    }
                    this.sendStatus();
                }
            },
            // Long Press Start
            () => {
                // Animation triggers in UI
            },
            // Long Press End (Action trigger)
            () => {
                if (this.state === 'OFF') {
                    this.startSystem();
                } else if (this.state === 'RUNNING') {
                    if (!this.isMatching) { // Only allow stop if matching is OFF
                        this.stopSystem();
                    } else {
                        ui.toast('Turn off Strip first', 'warn');
                    }
                }
            },
            // Duration Getter
            () => {
                 return (this.state === 'RUNNING') ? 2000 : 1000;
            }
        );

        // Pre-sets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.val;
                this.logEvent('preset', val);
                // Also trigger camera? "이벤트 버튼을 이용해서 카메라로 사진을 찍어"
                // Let's ask user. For now, assume a separate Camera button in presets might be better
                // Or simply triggering input
                document.getElementById('camera-input').click();
            });
        });
        
        document.getElementById('camera-input').addEventListener('change', (e) => {
             if (e.target.files.length > 0) {
                 // Upload logic
                 ui.toast('Photo captured');
                 this.logEvent('photo', 'captured');
             }
        });
    }

    setupGps() {
        gpsManager.onUpdate((data) => {
            // Update UI
            ui.updateStatus('gps', `Fix: ${data.accuracy.toFixed(1)}m`);
            this.gpsStatus = 'Fix';
            mapManager.centerMap(data.coords);
            
            // Logic
            if (this.state === 'RUNNING' && this.isMatching) {
                algorithmManager.processPosition(data.coords);
            }
            
            this.sendData({ type: 'gps', data });
        });
        
        gpsManager.start();
    }
    
    setupAlgorithmEvents() {
        document.addEventListener('linkPassed', (e) => {
             const { id, key, value } = e.detail;
             ui.toast(`Link ${id} Pass! New Val: ${value}`);
             this.sendData({ type: 'pass', id, key, value });
        });
    }
    
    startSystem() {
        // Validation (Spec 2.2)
        // 1. Check GPS
        // 2. Check Target Layer
        if (!layerManager.targetLayer) {
            ui.toast('No Target Layer Set', 'error');
            ui.updateStatus('system', 'warn');
            return;
        }
        
        // Simulating GPS check
        if (this.gpsStatus === 'Waiting...') {
             ui.toast('Waiting for GPS...', 'warn');
        }

        this.state = 'RUNNING';
        ui.updateStatus('system', 'on');
        ui.toast('System Started');
        this.sendStatus();
    }
    
    stopSystem() {
        // Wait 2 seconds (already handled by long press duration? Spec says 2 sec)
        // UI logic handles 1s. We might want to separate the duration.
        // For serviceable level, 1s is fine, or update UI.js to accept duration.
        
        this.state = 'OFF';
        this.isMatching = false;
        ui.updateStatus('system', 'off');
        ui.updateStatus('strip', false);
        ui.toast('System Stopped');
        // Stop GPS recording? (GPS Manager runs always to show position, but logic stops)
    }

    connectWs() {
        const url = settings.get('survey.wsUrl');
        try {
            this.ws = new WebSocket(url);
            this.ws.onopen = () => {
                ui.toast('WS Connected');
            };
            this.ws.onerror = (e) => {
                console.warn('WS Error', e);
            };
            this.ws.onclose = () => {
                console.log('WS Closed');
            };
        } catch (e) {
            console.error(e);
        }
    }
    
    sendStatus() {
        this.sendData({
             type: 'status',
             state: this.state,
             isMatching: this.isMatching,
             stripSeq: this.stripSeq
        });
    }

    sendData(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }
    
    logEvent(type, val) {
        // Create log entry
        console.log('Event:', type, val);
        this.sendData({ type: 'event', eventType: type, value: val });
    }
}

// Boot
const app = new App();
window.app = app; // for debugging
app.init();

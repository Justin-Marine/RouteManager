
const DEFAULT_CONFIG = {
    survey: {
        name: 'Default Survey',
        wsUrl: 'ws://localhost:8080'
    },
    algorithm: {
        mode: 'inc', // 'inc' or 'dec'
        bufferRadius: 30, // meters
        interpolationStep: 0.5, // meters
        overlapRatio: 0.85,
        targetLayerName: null,
        targetKeyColumn: null
    },
    system: {
        version: '1.0.0',
        installDate: new Date().toISOString()
    }
};

class SettingsManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        const stored = localStorage.getItem('spatial_force_config');
        if (stored) {
            // Merge with default to ensure new keys exist
            return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
        }
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    saveConfig(newConfig = null) {
        if (newConfig) {
            this.config = { ...this.config, ...newConfig };
        }
        localStorage.setItem('spatial_force_config', JSON.stringify(this.config));
        console.log('Config saved:', this.config);
    }

    resetConfig() {
        localStorage.removeItem('spatial_force_config');
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        return this.config;
    }

    exportConfig() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.config));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "spatial_force_settings.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
    
    // Helper to get nested safely
    get(path) {
        return path.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : undefined, this.config);
    }
    
    set(path, value) {
        const keys = path.split('.');
        let obj = this.config;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this.saveConfig();
    }
}

export const settings = new SettingsManager();


class GPSManager {
    constructor() {
        this.watchId = null;
        this.listeners = [];
    }

    start() {
        if (!navigator.geolocation) {
            console.error("Geolocation not supported");
            return;
        }
        
        const options = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        };

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.handleUpdate(pos),
            (err) => this.handleError(err),
            options
        );
    }

    stop() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    handleUpdate(pos) {
        const data = {
            coords: [pos.coords.longitude, pos.coords.latitude],
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp
        };
        
        this.listeners.forEach(cb => cb(data));
    }

    handleError(err) {
        console.warn('GPS Error', err);
    }

    onUpdate(callback) {
        this.listeners.push(callback);
    }
}

export const gpsManager = new GPSManager();

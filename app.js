const App = {
    state: {
        systemOn: false,
        surveyOn: false,
        cameraStream: null
    },
    
    init: function() {
        console.log("App Initializing...");
        this.Map.init();
        this.UI.init();
    },

    Engine: {
        toggleSystem: function() {
            App.state.systemOn = !App.state.systemOn;
            const btn = document.getElementById('btn-power');
            const status = document.getElementById('st-sys');
            const surveyBtn = document.getElementById('btn-survey');
            
            if (App.state.systemOn) {
                btn.style.color = '#34c759'; // Green
                status.textContent = 'ON';
                status.classList.remove('off');
                status.style.color = '#34c759';
                surveyBtn.disabled = false;
                surveyBtn.textContent = '조사 시작';
                App.Engine.startGPS();
            } else {
                btn.style.color = '#ff3b30'; // Red
                status.textContent = 'OFF';
                status.classList.add('off');
                status.style.color = '#999';
                surveyBtn.disabled = true;
                surveyBtn.textContent = '시스템을 켜주세요';
                if (App.state.surveyOn) App.Engine.toggleSurvey();
                App.Engine.stopGPS();
            }
        },
        toggleSurvey: function() {
            if (!App.state.systemOn) return;
            App.state.surveyOn = !App.state.surveyOn;
            const status = document.getElementById('st-survey');
            const btn = document.getElementById('btn-survey');
            
            if (App.state.surveyOn) {
                status.textContent = 'Recording';
                status.style.color = '#ff3b30';
                btn.textContent = '조사 종료';
                btn.style.background = '#ff3b30';
            } else {
                status.textContent = 'Standby';
                status.style.color = '#999';
                btn.textContent = '조사 시작';
                btn.style.background = '#007aff';
            }
        },
        startGPS: function() {
            if (navigator.geolocation) {
                this.watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        document.getElementById('st-gps').textContent = 'Fix';
                        document.getElementById('st-gps').style.color = '#34c759';
                        App.Map.updateUserLocation([pos.coords.longitude, pos.coords.latitude]);
                    },
                    (err) => {
                        document.getElementById('st-gps').textContent = 'Error';
                        console.error(err);
                    },
                    { enableHighAccuracy: true }
                );
            }
        },
        stopGPS: function() {
            if (this.watchId) navigator.geolocation.clearWatch(this.watchId);
            document.getElementById('st-gps').textContent = '-';
            document.getElementById('st-gps').style.color = '#999';
        },
        exportLog: function() { alert('로그 내보내기 기능 (구현 필요)'); },
        toggleWS: function() { alert('WebSocket 연결 시도...'); }
    },

    UI: {
        init: function() {
            // 초기화 로직
        },
        openSettings: function() {
            document.getElementById('settings-view').classList.add('active');
        },
        closeSettings: function() {
            document.getElementById('settings-view').classList.remove('active');
        },
        switchTab: function(tabId) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            document.getElementById(tabId).classList.add('active');
            
            // 탭 버튼 활성화 상태 업데이트
            const btns = document.querySelectorAll('.tab');
            btns.forEach(btn => {
                if(btn.getAttribute('onclick').includes(tabId)) {
                    btn.classList.add('active');
                }
            });
        },
        toggleLayerPopover: function() {
            const el = document.getElementById('layer-popover');
            el.style.display = el.style.display === 'block' ? 'none' : 'block';
        },
        toggleAddForm: function() {
            const type = document.getElementById('add-type').value;
            if (type === 'geojson_file') {
                document.getElementById('add-url').style.display = 'none';
                document.getElementById('btn-file-sel').style.display = 'block';
            } else {
                document.getElementById('add-url').style.display = 'block';
                document.getElementById('btn-file-sel').style.display = 'none';
            }
        }
    },

    Map: {
        map: null,
        userMarker: null,
        init: function() {
            // MapLibre GL 초기화 (OpenStreetMap 타일 사용)
            this.map = new maplibregl.Map({
                container: 'map',
                style: {
                    'version': 8,
                    'sources': {
                        'osm': {
                            'type': 'raster',
                            'tiles': ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            'tileSize': 256,
                            'attribution': '&copy; OpenStreetMap Contributors'
                        }
                    },
                    'layers': [
                        {
                            'id': 'osm-tiles',
                            'type': 'raster',
                            'source': 'osm',
                            'minzoom': 0,
                            'maxzoom': 19
                        }
                    ]
                },
                center: [126.9780, 37.5665], // 서울 시청 부근
                zoom: 14
            });
            
            this.map.addControl(new maplibregl.NavigationControl(), 'top-left');
        },
        centerUser: function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    this.map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
                });
            } else {
                alert('GPS를 사용할 수 없습니다.');
            }
        },
        updateUserLocation: function(coords) {
            if (!this.userMarker) {
                const el = document.createElement('div');
                el.style.width = '20px';
                el.style.height = '20px';
                el.style.backgroundColor = '#007aff';
                el.style.borderRadius = '50%';
                el.style.border = '3px solid white';
                el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
                this.userMarker = new maplibregl.Marker({ element: el })
                    .setLngLat(coords)
                    .addTo(this.map);
            } else {
                this.userMarker.setLngLat(coords);
            }
        }
    },

    Event: {
        toggleMenu: function() {
            const menu = document.getElementById('event-sub-menu');
            menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
        },
        sendText: function(msg) {
            alert('이벤트 기록: ' + msg);
            this.toggleMenu();
        },
        startCamera: function() {
            const overlay = document.getElementById('camera-overlay');
            const video = document.getElementById('camera-view');
            overlay.style.display = 'flex';
            
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    App.state.cameraStream = stream;
                    video.srcObject = stream;
                })
                .catch(err => {
                    alert('카메라 접근 실패 (HTTPS 또는 localhost 환경 필요): ' + err);
                    overlay.style.display = 'none';
                });
        },
        closeCamera: function() {
            const overlay = document.getElementById('camera-overlay');
            overlay.style.display = 'none';
            if (App.state.cameraStream) {
                App.state.cameraStream.getTracks().forEach(track => track.stop());
                App.state.cameraStream = null;
            }
        },
        captureAndSend: function() {
            const video = document.getElementById('camera-view');
            const canvas = document.getElementById('camera-canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            alert('사진이 캡처되었습니다.');
            this.closeCamera();
        }
    },
    
    Layers: {
        addNewLayerFromUI: function() { alert('레이어 추가 기능'); }
    },
    
    Config: {
        saveFromUI: function() { alert('설정이 저장되었습니다.'); },
        exportSettings: function() { alert('설정 내보내기'); },
        importSettings: function() { alert('설정 불러오기'); },
        clearAll: function() { if(confirm('앱을 초기화 하시겠습니까?')) location.reload(); }
    }
};

window.onload = function() {
    App.init();
};
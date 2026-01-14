
const UI = {
    stack: [], tabState: {}, ignoreShort: false,
    
    init() {
        document.getElementById('modal-close').onclick = () => this.closeModal();
        document.getElementById('nav-back').onclick = () => this.popView();
        document.addEventListener('keydown', e => { if(e.key === 'Escape') this.stack.length > 1 ? this.popView() : this.closeModal(); });
        
        // Main Buttons
        document.getElementById('btn0_layer').onclick = () => this.pushView('Layers', 'tpl-layer', () => {
             LAYER.refreshList();
             this.bindLayerType();
        });
        document.getElementById('btn1_settings').onclick = () => this.pushView('Settings', 'tpl-settings', () => this.popSettings());
        document.getElementById('btn3_event').onclick = () => this.togglePresets();
        document.getElementById('btn2_mapcenter').onclick = () => MAP.forceCenter();
        
        document.querySelectorAll('.preset-btn').forEach(b => {
             b.onclick = () => { APP_LOGIC.logEvent(b.dataset.val); document.getElementById('camera-trigger').click(); this.togglePresets(false); };
        });
        
        this.bindFuncBtn();
        this.bindInputs();
    },
    
    bindLayerType() {
        const sel = document.getElementById('l-type');
        const fileGrp = document.getElementById('file-grp');
        const urlGrp = document.getElementById('url-grp'); // NEW
        
        if(sel && fileGrp && urlGrp) {
            sel.onchange = () => {
                if(sel.value === 'wfs' || sel.value === 'wms') {
                    fileGrp.classList.add('hidden');
                    urlGrp.classList.remove('hidden');
                } else {
                    fileGrp.classList.remove('hidden');
                    urlGrp.classList.add('hidden');
                }
            };
            // Trigger once
            sel.dispatchEvent(new Event('change'));
        }
    },
    
    pushView(title, tpl, onShow) {
        const modal = document.getElementById('main-modal');
        if(!modal.classList.contains('visible')) { this.stack = []; modal.classList.remove('hidden'); void modal.offsetWidth; modal.classList.add('visible'); }
        
        document.getElementById('modal-body').innerHTML = '';
        const c = document.getElementById(tpl).cloneNode(true);
        c.id = ''; c.classList.remove('hidden');
        document.getElementById('modal-body').appendChild(c);
        
        this.stack.push({title, tpl, onShow});
        this.updateHeader();
        
        if(this.tabState[tpl]) this.tab(this.tabState[tpl], true);
        if(onShow) onShow();
    },
    
    popView() {
        if(this.stack.length <= 1) { this.closeModal(); return; }
        this.stack.pop();
        const prev = this.stack[this.stack.length - 1];
        
        document.getElementById('modal-body').innerHTML = '';
        const c = document.getElementById(prev.tpl).cloneNode(true);
        c.id = ''; c.classList.remove('hidden');
        document.getElementById('modal-body').appendChild(c);
        
        this.updateHeader();
        if(this.tabState[prev.tpl]) this.tab(this.tabState[prev.tpl], true);
        if(prev.onShow) prev.onShow();
    },
    
    updateHeader() { 
        const h = this.stack[this.stack.length - 1]; 
        document.getElementById('modal-title').innerText = h.title; 
        document.getElementById('nav-back').classList.toggle('hidden', this.stack.length <= 1); 
    },
    
    closeModal() { 
        const m = document.getElementById('main-modal');
        m.classList.remove('visible'); 
        setTimeout(() => { m.classList.add('hidden'); this.stack = []; }, 300); 
    },
    
    tab(id) {
        const curTpl = this.stack[this.stack.length - 1].tpl;
        this.tabState[curTpl] = id;
        
        const b = document.getElementById('modal-body');
        b.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        b.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        const t = b.querySelector('#tab-' + id); if(t) t.classList.add('active');
        const btn = b.querySelector('#tab-btn-' + id); if(btn) btn.classList.add('active');
        
        if(id === 'target') this.populateTargetUI();
    },
    
    populateTargetUI() {
         const tSel = document.getElementById('t-layer');
         if(tSel.options.length <= 0) {
             tSel.innerHTML = '<option value="">Select Layer...</option>';
             LAYER.list.forEach(l => tSel.appendChild(new Option(l.name, l.id)));
         }
         
         if(APP.config.target.layerId) {
             tSel.value = APP.config.target.layerId;
             tSel.dispatchEvent(new Event('change')); 
             setTimeout(() => {
                 if(APP.config.target.key) document.getElementById('t-key').value = APP.config.target.key;
                 if(APP.config.target.check) document.getElementById('t-check').value = APP.config.target.check;
                 if(APP.config.target.init) document.getElementById('t-init').value = APP.config.target.init;
             }, 100);
         }
    },
    
    bindFuncBtn() {
        const btn = document.getElementById('btn4_func');
        const r = document.querySelector('.progress-ring__circle');
        let t;
        
        const p = () => { 
            this.ignoreShort = false; 
            let d = (APP.state === 'RUNNING') ? 2000 : 1000; 
            r.style.transition = `stroke-dashoffset ${d}ms linear`; 
            r.style.strokeDashoffset = '0'; 
            t = setTimeout(() => { this.ignoreShort = true; this.onFuncLong(); }, d); 
        };
        const rl = () => { clearTimeout(t); r.style.transition = 'none'; r.style.strokeDashoffset = '176'; };
        
        btn.onmousedown = p; btn.ontouchstart = (e) => { e.preventDefault(); p(); }
        btn.onmouseup = rl; btn.ontouchend = (e) => { e.preventDefault(); rl(); }
        btn.onclick = () => this.onFuncShort();
    },
    
    onFuncShort() {
        if(this.ignoreShort) { this.ignoreShort = false; return; }
        if(APP.state !== 'RUNNING') return;
        APP.matching = !APP.matching;
        this.updateStatus();
        this.toast(APP.matching ? 'STRIP ON' : 'STRIP PAUSED');
        if(APP.matching) { 
            APP.seq++; // Req: Increase on ON? Or just ON. Let's keep existing logic.
            document.getElementById('seq-val').innerText = APP.seq; 
        }
        APP_LOGIC.sendStatus();
    },
    
    onFuncLong() {
        if(APP.state === 'OFF') { 
            if(APP_LOGIC.checkStart()) { 
                APP.state = 'RUNNING'; 
                APP.seq = 1; // Req: Reset Seq on Start (since it reset on Stop)
                document.getElementById('seq-val').innerText = APP.seq;
                this.toast('SYSTEM STARTED'); 
                this.updateStatus(); 
            } 
        } else { 
            if(APP.matching) { 
                this.toast('Stop Strip First', 'warn'); 
            } else { 
                APP.state = 'OFF'; 
                this.toast('SYSTEM STOPPED'); 
                this.updateStatus(); 
            } 
        }
    },
    
    updateStatus() {
        const s = document.getElementById('sys-dot'), t = document.getElementById('strip-dot');
        const btn = document.getElementById('btn4_func');
        const icon = btn.querySelector('i');
        
        // System Status Dot & Func Icon
        if(APP.state === 'OFF') {
            s.className = 'status-icon';
            icon.className = 'fas fa-play';
            btn.style.backgroundColor = 'rgba(0, 230, 118, 0.15)'; 
            btn.style.boxShadow = 'none';
        } else {
            s.className = GPS.isFixed() ? 'status-icon on' : 'status-icon warn';
            
            // Icon Logic: Strip ON -> Circle, Strip OFF -> Pause
            if(APP.matching) {
                icon.className = 'fas fa-circle';
            } else {
                icon.className = 'fas fa-pause'; // Req: Pause Icon
            }
        }
        
        // Strip Status Dot & Button Style
        if(APP.matching) {
            t.className = 'status-icon on';
            btn.style.backgroundColor = 'rgba(0, 230, 118, 0.8)';
            btn.style.color = '#000'; 
            btn.style.boxShadow = '0 0 15px #00e676';
        } else {
            t.className = 'status-icon';
            btn.style.backgroundColor = 'rgba(0, 230, 118, 0.15)';
            btn.style.color = '#fff';
            btn.style.boxShadow = 'none';
        }
    },
    
    togglePresets(f) { const e = document.getElementById('preset-overlay'); if(f !== undefined) f ? e.classList.remove('hidden') : e.classList.add('hidden'); else e.classList.toggle('hidden'); },
    
    toast(m, t = 'info') {
       // New Container Logic
       const container = document.getElementById('toast-container');
       if(container) {
           const el = document.createElement('div');
           el.className = 'toast-item';
           if(t==='warn') el.style.borderLeft = '4px solid #ffea00';
           else if(t==='error') el.style.borderLeft = '4px solid #ff1744';
           else el.style.borderLeft = '4px solid #00e676';
           
           el.innerHTML = `<span>${m}</span>`;
           container.appendChild(el);
           
           if(container.children.length > 5) container.removeChild(container.firstChild); // Keep 5
           
           setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 3000); // Auto expire
       }
    },
    
    bindInputs() {
        const lf = document.getElementById('l-file');
        if(lf) lf.onchange = (e) => document.getElementById('file-name').innerText = e.target.files[0]?.name || '';
    },
    
    toggleCheckNew() { document.getElementById('t-check').classList.toggle('hidden'); document.getElementById('t-check-new').classList.toggle('hidden'); },
    
    popSettings() {
        document.getElementById('s-name').value = APP.config.survey.name;
        document.getElementById('s-ws').value = APP.config.survey.ws;
        document.getElementById('a-rad').value = APP.config.algo.radius;
        document.getElementById('a-interp').value = APP.config.algo.interp;
        document.getElementById('a-overlap').value = APP.config.algo.overlap;
    }
};

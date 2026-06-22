/* ============================================================================
   DECENTRALIZED BRAIN SWARM SYSTEM — CONTROLLER SCRIPT v3
   Fixes: ANSI stripping, thinking-bubble render guarantee, colored chat UI
   ============================================================================ */

document.addEventListener('DOMContentLoaded', () => {

    /* ── DOM References ─────────────────────────────────────────────────────── */
    const queryInput     = document.getElementById('query-input');
    const sendBtn        = document.getElementById('send-btn');
    const chatMessages   = document.getElementById('chat-messages');
    const swarmStatus    = document.getElementById('swarm-status');
    const pipeStatusTxt  = document.getElementById('pipeline-status-text');
    const maxLevelSelect = document.getElementById('max-level-select');

    const STEPS = {
        eval:      document.getElementById('step-eval'),
        vote:      document.getElementById('step-vote'),
        active:    document.getElementById('step-active'),
        rounds:    document.getElementById('step-rounds'),
        consensus: document.getElementById('step-consensus'),
        narrative: document.getElementById('step-narrative'),
    };

    const CONNECTORS = [
        document.getElementById('conn-1'),
        document.getElementById('conn-2'),
        document.getElementById('conn-3'),
        document.getElementById('conn-4'),
        document.getElementById('conn-5'),
    ];

    const STEP_ORDER = ['eval', 'vote', 'active', 'rounds', 'consensus', 'narrative'];

    /* ── State ──────────────────────────────────────────────────────────────── */
    let isProcessing = false;

    /* ── Helpers ────────────────────────────────────────────────────────────── */
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    /** Yield to the browser so it can paint before we continue */
    const yieldFrame = () => new Promise(res => requestAnimationFrame(res));

    /** Strip all ANSI/VT100 terminal escape codes from a string */
    function stripAnsi(str) {
        if (!str) return '';
        return str
            .replace(/\x1B\[[0-9;]*[mGKHF]/g, '')   // ESC [ … m
            .replace(/\[\d+;\d+m|\[\d+m/g, '')         // bare [1;33m leftovers
            .replace(/\[0m/g, '')                       // [0m reset
            .trim();
    }

    /** Convert region name → SVG element ID */
    function getSvgId(name) {
        const clean = (name || '').toLowerCase()
            .replace(/agent/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        return 'region-' + clean;
    }

    /* ── Region colour palette ──────────────────────────────────────────────── */
    const REGION_COLORS = {
        'prosencephalon':  '#0084ff',
        'telencephalon':   '#39ff14',
        'diencephalon':    '#00e8ff',
        'midbrain':        '#ffb300',
        'part of midbrain':'#ffb300',
        'metencephalon':   '#cc00ff',
        'rhombencephalon': '#ff4d8a',
        'medulla oblongata': '#7c00ff',
        'aqueduct':        '#cc00ff',
        'fourth ventricle':'#cc00ff',
        
        // Redesign parts
        'frontal-lobe':    '#39ff14',
        'parietal-lobe':   '#2cd40e',
        'temporal-lobe':   '#1eb006',
        'occipital-lobe':  '#57ff3c',
        'thalamus':        '#00e8ff',
        'hypothalamus':    '#00a2ff',
        'pons':            '#9600e8',
        'cerebellum':      '#cc00ff',
        'red-nucleus':     '#ff0000',
        'substantia-nigra':'#ffffff',
        'corpus-callosum': '#00ffcc',
        'limbic-lobe':     '#ff007f',
        'cingulate-gyrus': '#ff007f',
        'pineal-body':     '#ffcc00',
        'epithalamus':     '#ffcc00',
        'optic-chiasm':    '#00ff66',
        'optic-nerve':     '#00ff66',
        'optic-tract':     '#00ff66',
        'superior-colliculus': '#ff5500',
        'inferior-colliculus': '#ffaa00',
        'lateral-ventricle': '#00ffff',
        'third-ventricle': '#00d5ff',
        'insula':          '#ff00ff',
        'pellucid-septum': '#00ffff'
    };

    function getRegionColor(name) {
        const key = (name || '').toLowerCase().replace(/agent|:/g, '').trim();
        for (const [k, v] of Object.entries(REGION_COLORS)) {
            if (key.includes(k)) return v;
        }
        return '#8899aa';
    }

    function normalizeDisplayName(name) {
        const map = {
            'prosencephalon': 'Prosencephalon',
            'telencephalon':  'Telencephalon',
            'diencephalon':   'Diencephalon',
            'midbrain':       'Midbrain',
            'metencephalon':  'Metencephalon',
            'rhombencephalon':'Rhombencephalon',
            'medulla':        'Medulla Oblongata',
            
            // Redesign parts display normalization
            'frontal-lobe':   'Frontal Lobe',
            'parietal-lobe':  'Parietal Lobe',
            'temporal-lobe':  'Temporal Lobe',
            'occipital-lobe': 'Occipital Lobe',
            'thalamus':       'Thalamus',
            'hypothalamus':   'Hypothalamus',
            'pons':           'Pons',
            'cerebellum':     'Cerebellum',
            'red-nucleus':    'Red Nucleus',
            'substantia-nigra':'Substantia Nigra',
            'corpus-callosum':'Corpus Callosum',
            'limbic-lobe':    'Limbic Lobe',
            'insula':         'Insula',
            'lateral-ventricle':'Lateral Ventricle',
            'third-ventricle':'Third Ventricle',
            'pineal-body':    'Pineal Body',
            'optic-chiasm':   'Optic Chiasm',
            'optic-nerve':    'Optic Nerve',
            'optic-tract':    'Optic Tract',
            'superior-colliculus': 'Superior Colliculus',
            'inferior-colliculus': 'Inferior Colliculus',
            'pellucid-septum':'Pellucid Septum'
        };
        const lower = (name || '').toLowerCase();
        for (const [k, v] of Object.entries(map)) {
            if (lower.includes(k)) return v;
        }
        return name.replace(/\b\w/g, c => c.toUpperCase());
    }

    /* Hierarchy to SVG element mappings for level 3, 4, 5 support */
    const HIERARCHY_SVG_MAP = {
        'region-telencephalon': ['region-frontal-lobe', 'region-parietal-lobe', 'region-temporal-lobe', 'region-occipital-lobe', 'region-corpus-callosum', 'region-limbic-lobe', 'region-insula', 'region-lateral-ventricle'],
        'region-cerebrum': ['region-frontal-lobe', 'region-parietal-lobe', 'region-temporal-lobe', 'region-occipital-lobe', 'region-corpus-callosum', 'region-limbic-lobe', 'region-insula', 'region-lateral-ventricle'],
        'region-prosencephalon': ['region-frontal-lobe', 'region-parietal-lobe', 'region-temporal-lobe', 'region-occipital-lobe', 'region-thalamus', 'region-hypothalamus', 'region-corpus-callosum', 'region-limbic-lobe', 'region-insula', 'region-lateral-ventricle', 'region-third-ventricle', 'region-pineal-body', 'region-optic-chiasm', 'region-optic-nerve', 'region-optic-tract'],
        'region-diencephalon': ['region-thalamus', 'region-hypothalamus', 'region-third-ventricle', 'region-pineal-body', 'region-optic-chiasm', 'region-optic-nerve', 'region-optic-tract'],
        'region-metencephalon': ['region-pons', 'region-cerebellum'],
        'region-rhombencephalon': ['region-pons', 'region-cerebellum', 'region-medulla-oblongata', 'region-fourth-ventricle', 'region-aqueduct'],
        'region-midbrain': ['region-midbrain', 'region-part-of-midbrain', 'region-right-side-of-midbrain', 'region-left-side-of-midbrain', 'region-red-nucleus', 'region-substantia-nigra', 'region-superior-colliculus', 'region-inferior-colliculus'],
        
        // Map individual left/right/hemisphere parts directly to the 2D SVG components
        'region-left-frontal-lobe': ['region-frontal-lobe'],
        'region-right-frontal-lobe': ['region-frontal-lobe'],
        'region-left-parietal-lobe': ['region-parietal-lobe'],
        'region-right-parietal-lobe': ['region-parietal-lobe'],
        'region-left-temporal-lobe': ['region-temporal-lobe'],
        'region-right-temporal-lobe': ['region-temporal-lobe'],
        'region-left-occipital-lobe': ['region-occipital-lobe'],
        'region-right-occipital-lobe': ['region-occipital-lobe'],
        'region-left-thalamus': ['region-thalamus'],
        'region-right-thalamus': ['region-thalamus'],
        'region-left-hypothalamus': ['region-hypothalamus'],
        'region-right-hypothalamus': ['region-hypothalamus'],
        'region-left-hemisphere-of-cerebellum': ['region-cerebellum'],
        'region-right-hemisphere-of-cerebellum': ['region-cerebellum'],
        'region-left-red-nucleus': ['region-red-nucleus'],
        'region-right-red-nucleus': ['region-red-nucleus'],
        'region-left-substantia-nigra': ['region-substantia-nigra'],
        'region-right-substantia-nigra': ['region-substantia-nigra'],
        
        // Level 4/5 specific structures
        'region-corpus-callosum': ['region-corpus-callosum'],
        'region-limbic-lobe': ['region-limbic-lobe'],
        'region-left-limbic-lobe': ['region-limbic-lobe'],
        'region-right-limbic-lobe': ['region-limbic-lobe'],
        'region-insula': ['region-insula'],
        'region-left-insula': ['region-insula'],
        'region-right-insula': ['region-insula'],
        'region-lateral-ventricle': ['region-lateral-ventricle'],
        'region-left-lateral-ventricle': ['region-lateral-ventricle'],
        'region-right-lateral-ventricle': ['region-lateral-ventricle'],
        'region-third-ventricle': ['region-third-ventricle'],
        'region-epithalamus': ['region-pineal-body'],
        'region-pineal-body': ['region-pineal-body'],
        'region-optic-chiasm': ['region-optic-chiasm'],
        'region-left-optic-nerve': ['region-optic-nerve'],
        'region-right-optic-nerve': ['region-optic-nerve'],
        'region-left-optic-tract': ['region-optic-tract'],
        'region-right-optic-tract': ['region-optic-tract'],
        'region-superior-colliculus': ['region-superior-colliculus'],
        'region-inferior-colliculus': ['region-inferior-colliculus'],
        'region-left-superior-colliculus': ['region-superior-colliculus'],
        'region-right-superior-colliculus': ['region-superior-colliculus'],
        'region-left-inferior-colliculus': ['region-inferior-colliculus'],
        'region-right-inferior-colliculus': ['region-inferior-colliculus'],
        'region-septum-of-telencephalon': ['region-pellucid-septum'],
        'region-pellucid-septum': ['region-pellucid-septum']
    };

    /* Phase metadata: icon + colour for system bubbles */
    const PHASE_META = {
        eval:      { icon: '⬡', color: '#0084ff', label: 'Evaluation' },
        vote:      { icon: '⇅', color: '#00e8ff', label: 'Voting' },
        active:    { icon: '⚡', color: '#39ff14', label: 'Activation' },
        rounds:    { icon: '↺', color: '#ffb300', label: 'Rounds' },
        consensus: { icon: '◎', color: '#cc00ff', label: 'Consensus' },
        narrative: { icon: '✦', color: '#ff4d8a', label: 'Narration' },
        error:     { icon: '⚠', color: '#ff3b3b', label: 'Error' },
        user:      { icon: '❯', color: '#5c6e82', label: 'Query' },
    };

    /* ── Pipeline Step Tracker ──────────────────────────────────────────────── */
    function resetPipeline() {
        STEP_ORDER.forEach(key => STEPS[key].classList.remove('active', 'completed'));
        CONNECTORS.forEach(c => c.classList.remove('filled', 'flowing'));
        pipeStatusTxt.textContent = 'Idle — waiting for query';
    }

    function setStepActive(key, label) {
        const idx = STEP_ORDER.indexOf(key);
        STEP_ORDER.slice(0, idx).forEach(k => {
            STEPS[k].classList.remove('active');
            STEPS[k].classList.add('completed');
        });
        CONNECTORS.forEach((c, i) => {
            c.classList.remove('flowing', 'filled');
            if (i < idx - 1) c.classList.add('filled');
            if (i === idx - 1) c.classList.add('flowing');
        });
        STEPS[key].classList.remove('completed');
        STEPS[key].classList.add('active');
        pipeStatusTxt.textContent = label || key;
    }

    function completePipeline() {
        STEP_ORDER.forEach(key => {
            STEPS[key].classList.remove('active');
            STEPS[key].classList.add('completed');
        });
        CONNECTORS.forEach(c => { c.classList.remove('flowing'); c.classList.add('filled'); });
        pipeStatusTxt.textContent = 'Pipeline complete ✓';
    }

    /* ── Brain SVG ──────────────────────────────────────────────────────────── */
    function resetBrain() {
        document.querySelectorAll('.region-path').forEach(p => p.classList.remove('active'));
    }

    function highlightRegions(regions) {
        (regions || []).forEach(r => {
            const id = getSvgId(r.region_name || r);
            const targets = HIERARCHY_SVG_MAP[id] || [id];
            targets.forEach(targetId => {
                const el = document.getElementById(targetId);
                if (el) el.classList.add('active');
            });
        });
    }

    function highlightSingle(name) {
        resetBrain();
        const id = getSvgId(name);
        const targets = HIERARCHY_SVG_MAP[id] || [id];
        targets.forEach(targetId => {
            const el = document.getElementById(targetId);
            if (el) el.classList.add('active');
        });
    }

    /* ── Scroll ─────────────────────────────────────────────────────────────── */
    function scrollToBottom() {
        const container = chatMessages.parentElement;   // .chat-container
        if (container) container.scrollTop = container.scrollHeight;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /* ── Chat Rendering ─────────────────────────────────────────────────────── */

    /**
     * System bubble — left-aligned with a phase icon + coloured accent stripe
     * @param {string} text
     * @param {string} phase  key from PHASE_META
     */
    function addSystemBubble(text, phase = 'eval') {
        const meta = PHASE_META[phase] || PHASE_META.eval;
        const el = document.createElement('div');
        el.className = 'system-bubble-v2';
        el.style.setProperty('--phase-color', meta.color);
        el.innerHTML = `
            <span class="sys-icon">${meta.icon}</span>
            <div class="sys-content">
                <span class="sys-label">${meta.label}</span>
                <span class="sys-text">${text}</span>
            </div>`;
        chatMessages.appendChild(el);
        scrollToBottom();
        return el;
    }

    /** User query bubble */
    function addUserBubble(text) {
        const meta = PHASE_META.user;
        const el = document.createElement('div');
        el.className = 'user-query-bubble';
        el.innerHTML = `
            <span class="sys-icon user-icon">${meta.icon}</span>
            <div class="sys-content">
                <span class="sys-label">Your Query</span>
                <span class="user-text">${text}</span>
            </div>`;
        chatMessages.appendChild(el);
        scrollToBottom();
    }

    function addRoundSeparator(roundNum) {
        const sep = document.createElement('div');
        sep.className = 'round-separator';
        const txt = document.createElement('span');
        txt.className = 'round-separator-text';
        txt.textContent = `Round ${roundNum}`;
        sep.appendChild(txt);
        chatMessages.appendChild(sep);
        scrollToBottom();
    }

    /**
     * Insert a thinking loader bubble.
     * CRITICAL: we await yieldFrame() after inserting so the browser
     * actually paints the dots before the sleep + replace happens.
     */
    async function addThinkingBubble(agentName, color) {
        const wrapper = document.createElement('div');
        wrapper.className = 'agent-message left';

        // Subtle background tint matching agent colour
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        const header = document.createElement('div');
        header.className = 'agent-bubble-header';
        header.style.color = color;
        header.innerHTML = `<span class="agent-dot" style="background:${color}"></span><span>${agentName}</span>`;
        wrapper.appendChild(header);

        const bubble = document.createElement('div');
        bubble.className = 'thinking-bubble';
        bubble.style.borderColor = `rgba(${r},${g},${b},0.25)`;
        bubble.style.background = `rgba(${r},${g},${b},0.06)`;

        const dots = document.createElement('div');
        dots.className = 'thinking-dots';
        for (let i = 0; i < 3; i++) {
            const d = document.createElement('span');
            d.className = 'thinking-dot';
            d.style.background = color;
            dots.appendChild(d);
        }
        bubble.appendChild(dots);

        const lbl = document.createElement('span');
        lbl.className = 'thinking-label';
        lbl.textContent = 'Reasoning…';
        bubble.appendChild(lbl);
        wrapper.appendChild(bubble);

        chatMessages.appendChild(wrapper);
        scrollToBottom();

        // ⚠ CRITICAL: yield to browser paint cycle so dots are visible
        await yieldFrame();
        await yieldFrame();

        return wrapper;
    }

    /** Replace a thinking bubble with the actual speech bubble */
    function replaceThinkingBubble(thinkingEl, agentName, text, roundNum, color) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        const wrapper = document.createElement('div');
        wrapper.className = 'agent-message left';

        const header = document.createElement('div');
        header.className = 'agent-bubble-header';
        header.style.color = color;
        header.innerHTML = `
            <span class="agent-dot" style="background:${color}"></span>
            <span>${agentName}</span>
            ${roundNum ? `<span class="round-tag">Round ${roundNum}</span>` : ''}`;
        wrapper.appendChild(header);

        const bubble = document.createElement('div');
        bubble.className = 'agent-bubble';
        bubble.style.borderLeft = `3px solid ${color}`;
        bubble.style.background = `rgba(${r},${g},${b},0.055)`;
        bubble.textContent = stripAnsi(text);
        wrapper.appendChild(bubble);

        if (chatMessages.contains(thinkingEl)) {
            chatMessages.replaceChild(wrapper, thinkingEl);
        } else {
            chatMessages.appendChild(wrapper);
        }
        scrollToBottom();
    }

    /** Final narrative card injected into chat */
    function addNarrativeBubble(narrativeText, finalAnswer) {
        // Separator
        const sep = document.createElement('div');
        sep.className = 'round-separator';
        const sepTxt = document.createElement('span');
        sepTxt.className = 'round-separator-text';
        sepTxt.textContent = '✦ Final Narrative';
        sep.appendChild(sepTxt);
        chatMessages.appendChild(sep);

        const wrapper = document.createElement('div');
        wrapper.className = 'narrative-bubble';

        // Answer chip
        if (finalAnswer) {
            const chip = document.createElement('div');
            chip.className = 'final-answer-chip';
            chip.innerHTML = `<span class="chip-label">Final Answer</span><span class="chip-text">${stripAnsi(finalAnswer)}</span>`;
            wrapper.appendChild(chip);
        }

        // Narrative body
        const body = document.createElement('div');
        body.className = 'narrative-body';
        const cleaned = stripAnsi(narrativeText || '')
            .replace(/={3,}/g, '')                       // strip ===== lines
            .replace(/FINAL NETWORK NARRATIVE/gi, '')    // strip header text
            .replace(/CONSENSUS SUMMARY \(JSON\)[\s\S]*$/, '') // strip consensus JSON block and anything after
            .replace(/FINAL SYSTEM ANSWER[\s\S]*$/, '')  // strip trailing answer block
            .replace(/^\s*\n+/g, '')
            .trim();
        body.textContent = cleaned || stripAnsi(narrativeText);
        wrapper.appendChild(body);

        chatMessages.appendChild(wrapper);
        scrollToBottom();
    }

    /* ── Main Query Submit ──────────────────────────────────────────────────── */
    async function submitQuery() {
        if (isProcessing) return;
        const query = queryInput.value.trim();
        if (!query) return;

        // Clear input bar immediately per user request
        queryInput.value = '';

        // Add user query bubble immediately
        addUserBubble(query);

        isProcessing = true;
        sendBtn.disabled = true;
        queryInput.disabled = true;

        resetBrain();
        resetPipeline();

        swarmStatus.textContent = 'Active';
        swarmStatus.className = 'status-badge active';

        const maxLevel = parseInt(maxLevelSelect.value, 10) || 3;

        try {
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, mode: 'real', stream: true, max_level: maxLevel })
            });

            if (!response.ok) {
                let errText = 'Backend error';
                try {
                    const err = await response.json();
                    errText = err.error || errText;
                } catch(_) {}
                throw new Error(errText);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            let activeRegions = [];
            let thinkingBubbles = {};

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep last partial line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    const eventData = JSON.parse(line);

                    switch (eventData.event) {
                        case 'eval_start': {
                            setStepActive('eval', 'Evaluating region involvements…');
                            addSystemBubble('Broadcasting query to all brain regions for evaluation…', 'eval');
                            break;
                        }

                        case 'eval_end': {
                            const evaluations = eventData.evaluations || [];
                            evaluations.forEach(ev => {
                                if (ev.involved) {
                                    const el = document.getElementById(getSvgId(ev.region_name));
                                    if (el) el.classList.add('active');
                                }
                            });
                            break;
                        }

                        case 'vote_start': {
                            setStepActive('vote', 'Peer voting in progress…');
                            addSystemBubble('Regions are casting peer-involvement votes…', 'vote');
                            break;
                        }

                        case 'vote_end': {
                            resetBrain();
                            break;
                        }

                        case 'active_start': {
                            setStepActive('active', 'Activating involved regions…');
                            break;
                        }

                        case 'active_end': {
                            activeRegions = eventData.active_regions || [];
                            const activeNames = activeRegions.map(r => r.region_name).join(', ') || 'None';
                            addSystemBubble(`Active regions: ${activeNames}`, 'active');
                            highlightRegions(activeRegions);
                            break;
                        }

                        case 'round_start': {
                            const roundNum = eventData.round;
                            setStepActive('rounds', `Running interaction round ${roundNum}…`);
                            addRoundSeparator(roundNum);
                            thinkingBubbles = {};
                            
                            // Initialize thinking loaders for ALL active regions simultaneously
                            for (const arName of eventData.active_regions || []) {
                                const display = normalizeDisplayName(arName);
                                const color = getRegionColor(arName);
                                thinkingBubbles[arName] = await addThinkingBubble(display, color);
                            }
                            break;
                        }

                        case 'agent_speech': {
                            const rNum = eventData.round;
                            const regName = eventData.region;
                            const text = eventData.text;

                            const display = normalizeDisplayName(regName);
                            const color = getRegionColor(regName);

                            // Highlight this region on the brain SVG
                            highlightSingle(regName);

                            // Replace its thinking loader bubble with the speech content
                            if (thinkingBubbles[regName]) {
                                replaceThinkingBubble(thinkingBubbles[regName], display, text, rNum, color);
                            } else {
                                const tempEl = await addThinkingBubble(display, color);
                                replaceThinkingBubble(tempEl, display, text, rNum, color);
                            }
                            break;
                        }

                        case 'round_end': {
                            // Re-highlight all active regions on round completion
                            resetBrain();
                            highlightRegions(activeRegions);
                            break;
                        }

                        case 'consensus_start': {
                            setStepActive('consensus', 'Aggregating consensus…');
                            addSystemBubble('Meta-Agent aggregating consensus from all active regions…', 'consensus');
                            break;
                        }

                        case 'consensus_end': {
                            const consensus = eventData.consensus || {};
                            const finalAns = stripAnsi(consensus.answer || '');
                            const confidence = consensus.confidence || null;

                            if (finalAns) {
                                const color = '#cc00ff';
                                const r = 204, g = 0, b = 255;
                                const wrapper = document.createElement('div');
                                wrapper.className = 'agent-message left';
                                wrapper.innerHTML = `
                                    <div class="agent-bubble-header" style="color:${color}">
                                        <span class="agent-dot" style="background:${color}"></span>
                                        <span>Consensus Generator</span>
                                    </div>
                                    <div class="agent-bubble" style="border-left:3px solid ${color};background:rgba(${r},${g},${b},0.055)">
                                        ${finalAns}
                                        ${confidence ? `<div class="confidence-bar-wrap">
                                            <div class="confidence-bar" style="width:${(confidence*100).toFixed(0)}%;background:${color}"></div>
                                            <span class="confidence-label">${(confidence*100).toFixed(0)}% confidence</span>
                                        </div>` : ''}
                                    </div>`;
                                chatMessages.appendChild(wrapper);
                                scrollToBottom();
                            }
                            break;
                        }

                        case 'narrative_start': {
                            setStepActive('narrative', 'Generating neural narrative…');
                            addSystemBubble('Composing the final neural story from swarm output…', 'narrative');
                            break;
                        }

                        case 'narrative_end': {
                            const narrativeText = eventData.narrative || '';
                            const fAns = eventData.final_answer || '';
                            addNarrativeBubble(narrativeText, fAns);
                            break;
                        }

                        case 'complete': {
                            completePipeline();
                            swarmStatus.textContent = 'Completed';
                            swarmStatus.className = 'status-badge completed';
                            break;
                        }
                    }
                }
            }

        } catch (err) {
            console.error(err);
            resetPipeline();
            addSystemBubble(`${err.message}`, 'error');
            swarmStatus.textContent = 'Error';
            swarmStatus.className = 'status-badge';
        } finally {
            isProcessing = false;
            sendBtn.disabled = false;
            queryInput.disabled = false;
        }
    }

    /* ── Event Listeners ────────────────────────────────────────────────────── */
    sendBtn.addEventListener('click', submitQuery);

    queryInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitQuery();
        }
    });

    // Legend hover ↔ brain highlight
    document.querySelectorAll('.legend-item').forEach(item => {
        const regionId = item.getAttribute('data-region');
        
        let paths = [];
        if (regionId === 'region-midbrain') {
            paths = [
                document.getElementById('region-midbrain'),
                document.getElementById('region-part-of-midbrain'),
                document.getElementById('region-right-side-of-midbrain'),
                document.getElementById('region-left-side-of-midbrain')
            ].filter(Boolean);
        } else if (regionId === 'region-optic-pathway') {
            paths = [
                document.getElementById('region-optic-chiasm'),
                document.getElementById('region-optic-nerve'),
                document.getElementById('region-optic-tract')
            ].filter(Boolean);
        } else if (regionId === 'region-colliculi') {
            paths = [
                document.getElementById('region-superior-colliculus'),
                document.getElementById('region-inferior-colliculus')
            ].filter(Boolean);
        } else if (regionId === 'region-ventricles') {
            paths = [
                document.getElementById('region-lateral-ventricle'),
                document.getElementById('region-third-ventricle'),
                document.getElementById('region-fourth-ventricle'),
                document.getElementById('region-aqueduct')
            ].filter(Boolean);
        } else {
            const p = document.getElementById(regionId);
            if (p) paths.push(p);
        }

        item.addEventListener('mouseenter', () => {
            paths.forEach(path => {
                if (path && !path.classList.contains('active'))
                    path.style.fill = 'rgba(255,255,255,0.08)';
            });
        });
        item.addEventListener('mouseleave', () => {
            paths.forEach(path => {
                if (path && !path.classList.contains('active'))
                    path.style.fill = '';
            });
        });
    });

});

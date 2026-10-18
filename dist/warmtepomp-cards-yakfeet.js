/*
 * Warmtepomp cards (aangepast)
 *  - custom:atlantic-explorer-card   -> Atlantic Explorer V5 warmtepompboiler
 *  - custom:panasonic-monoblock-card -> Panasonic monoblock, zonder buffervat
 * Gebaseerd op het idee van AMensink/warmtepomp-cards (MIT), volledig herschreven.
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isNum = (v) => v !== null && v !== undefined && !isNaN(v);
const fmt = (v, d = 1, u = '') => (isNum(v) ? Number(v).toFixed(d).replace('.', ',') + u : '–');
const tempColor = (t, lo = 15, hi = 60) => {
  if (!isNum(t)) return '#9aa5b1';
  const k = clamp((t - lo) / (hi - lo), 0, 1);
  return `hsl(${Math.round(210 - 205 * k)} 80% 52%)`;
};
const ON_STATES = ['on', 'true', 'heating', 'heat', 'running', 'active', 'defrosting', 'open'];

class WPBase extends HTMLElement {
  setConfig(config) {
    if (!config) throw new Error('Geen configuratie');
    this._c = { ...this.constructor.defaults(), ...config, entities: { ...(config.entities || {}) } };
    this._uid = 'u' + Math.random().toString(36).slice(2, 8);
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._sig = null;
    if (this._hass) this._render();
  }
  set hass(h) {
    this._hass = h;
    if (!this._c) return;
    const sig = Object.values(this._c.entities)
      .map((id) => (h.states[id] ? h.states[id].last_updated : '-'))
      .join('|');
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() { return 7; }
  _st(key) { const id = this._c.entities[key]; return id ? this._hass.states[id] : undefined; }
  _n(key) {
    const s = this._st(key);
    if (!s) return null;
    const v = parseFloat(s.state);
    return isNaN(v) ? null : v;
  }
  _attr(key, a) { const s = this._st(key); return s && s.attributes ? s.attributes[a] : undefined; }
  _on(key) {
    const s = this._st(key);
    if (!s) return false;
    if (ON_STATES.includes(String(s.state).toLowerCase())) return true;
    const v = parseFloat(s.state);
    return !isNaN(v) && v > 0;
  }
  _has(key) { return !!this._st(key); }
  _wire() {
    this.shadowRoot.querySelectorAll('[data-e]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = this._c.entities[el.dataset.e];
        if (!id) return;
        this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: id } }));
      });
    });
  }
  _shell(title, body) {
    this.shadowRoot.innerHTML = `
    <style>
      ha-card{padding:16px;overflow:hidden}
      .head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
      .title{font-size:1.15rem;font-weight:600;color:var(--primary-text-color)}
      .sub{font-size:.85rem;color:var(--secondary-text-color)}
      svg{width:100%;height:auto;display:block}
      svg text{font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif)}
      .lbl{fill:var(--secondary-text-color);font-size:11px}
      .val{fill:var(--primary-text-color);font-size:13px;font-weight:600}
      [data-e]{cursor:pointer}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      .chip{font-size:.78rem;padding:3px 10px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color)}
      .chip.on{background:var(--primary-color);color:var(--text-primary-color,#fff)}
      .chip.warn{background:var(--error-color,#db4437);color:#fff}
      .chip.heat{background:#e8590c;color:#fff}
      .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-top:6px}
      .stat{background:var(--secondary-background-color);border-radius:12px;padding:8px 10px;text-align:center}
      .stat b{display:block;font-size:1.05rem;color:var(--primary-text-color);font-weight:600}
      .stat span{font-size:.72rem;color:var(--secondary-text-color)}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes flow{to{stroke-dashoffset:-32}}
      @keyframes air{0%{opacity:0;transform:translateX(-6px)}50%{opacity:1}100%{opacity:0;transform:translateX(6px)}}
      @keyframes glow{0%,100%{opacity:.55}50%{opacity:1}}
      .fan{transform-box:fill-box;transform-origin:center}
      .run .fan{animation:spin var(--fan,1.2s) linear infinite}
      .flowline{stroke-dasharray:2 14;stroke-linecap:round;animation:flow var(--flow,1.4s) linear infinite}
      .airin{animation:air 1.6s ease-in-out infinite}
      .glow{animation:glow 1.4s ease-in-out infinite}
      @media (prefers-reduced-motion:reduce){.fan,.flowline,.airin,.glow{animation:none!important}}
    </style>
    <ha-card>
      <div class="head"><div class="title">${title.t}</div><div class="sub">${title.s || ''}</div></div>
      ${body}
    </ha-card>`;
    this._wire();
  }
}

/* ------------------------------------------------------------------ */
/*  Atlantic Explorer V5                                              */
/* ------------------------------------------------------------------ */
class AtlanticExplorerCard extends WPBase {
  static defaults() { return { title: 'Warmwater', min_temp: 15, max_temp: 60 }; }
  static getStubConfig() {
    return { type: 'custom:atlantic-explorer-card', entities: { water_heater: 'water_heater.explorer' } };
  }

  _render() {
    if (!this._hass || !this._c) return;
    const c = this._c;
    const wh = this._st('water_heater');
    const top = this._n('tank_top') ?? this._n('tank_temp') ?? (wh ? parseFloat(wh.attributes.current_temperature) : null);
    const onlyMid = !this._has('tank_top') && !this._has('tank_bottom');
    const bottom = this._n('tank_bottom') ?? top;
    const setpoint = this._n('setpoint') ?? (wh ? parseFloat(wh.attributes.temperature) : null);
    const power = this._n('power');
    const heater = this._on('heater');
    const boost = this._on('boost');
    const away = this._on('away') || (wh && wh.attributes.away_mode === 'on');
    const fault = this._st('fault') && !['0', 'off', 'none', 'unknown', 'unavailable', ''].includes(String(this._st('fault').state).toLowerCase());
    let hp;
    if (this._has('compressor')) hp = this._on('compressor');
    else if (isNum(power)) hp = power > 50 && !heater;
    else hp = false;
    const modeRaw = (this._st('mode') && this._st('mode').state) || (wh && (wh.attributes.operation_mode || wh.state)) || '';
    const modeMap = { manual: 'Handmatig', auto: 'Eco+', eco: 'Eco+', 'eco+': 'Eco+', program: 'Programma', programmed: 'Programma', performance: 'Boost', electric: 'Elektrisch', off: 'Uit' };
    const mode = modeMap[String(modeRaw).toLowerCase()] || (modeRaw ? String(modeRaw) : '–');

    const lo = Number(c.min_temp), hi = Number(c.max_temp);
    const target = isNum(setpoint) ? setpoint : hi;
    const warmPct = isNum(top) ? clamp(Math.round(((top - lo) / Math.max(1, target - lo)) * 100), 0, 100) : null;
    const topC = tempColor(top, lo, hi), botC = tempColor(bottom, lo, hi);
    const u = this._uid;

    const svg = `
    <svg viewBox="0 0 360 440" class="${hp ? 'run' : ''}" style="--fan:${hp ? '0.9s' : '1.2s'}">
      <defs>
        <linearGradient id="${u}b" x1="0" x2="1"><stop offset="0" stop-color="#dfe4ea"/><stop offset=".35" stop-color="#ffffff"/><stop offset=".75" stop-color="#f1f4f7"/><stop offset="1" stop-color="#cfd6de"/></linearGradient>
        <linearGradient id="${u}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${topC}"/><stop offset="1" stop-color="${botC}"/></linearGradient>
        <clipPath id="${u}c"><rect x="116" y="184" width="128" height="204" rx="12"/></clipPath>
      </defs>
      <ellipse cx="180" cy="424" rx="96" ry="9" fill="#000" opacity=".12"/>
      <rect x="124" y="406" width="14" height="12" rx="3" fill="#9aa5b1"/><rect x="222" y="406" width="14" height="12" rx="3" fill="#9aa5b1"/>
      <!-- tank -->
      <rect x="100" y="146" width="160" height="262" rx="22" fill="url(#${u}b)" stroke="#bfc8d1"/>
      <!-- aansluitingen -->
      <rect x="136" y="136" width="12" height="14" fill="#2f80d0"/><rect x="212" y="136" width="12" height="14" fill="#d9480f"/>
      <!-- waterdoorsnede -->
      <rect x="116" y="184" width="128" height="204" rx="12" fill="url(#${u}w)" opacity=".92" data-e="water_heater"/>
      <g clip-path="url(#${u}c)" pointer-events="none">
        <path d="M128 232 h104 a10 10 0 0 1 0 20 h-104 a10 10 0 0 0 0 20 h104 a10 10 0 0 1 0 20 h-104 a10 10 0 0 0 0 20 h104"
              fill="none" stroke="${hp ? '#ff922b' : '#ffffff'}" stroke-opacity="${hp ? 1 : .45}" stroke-width="4" stroke-linecap="round"
              ${hp ? 'class="flowline" style="--flow:1.8s"' : ''}/>
        <line x1="124" y1="372" x2="236" y2="372" stroke="${heater ? '#ff3b30' : '#ffffff'}" stroke-opacity="${heater ? 1 : .5}" stroke-width="6" stroke-linecap="round" ${heater ? 'class="glow"' : ''}/>
        <rect x="116" y="184" width="22" height="204" fill="#fff" opacity=".18"/>
      </g>
      <text x="180" y="300" text-anchor="middle" font-size="34" font-weight="700" fill="#fff" stroke="#00000033" stroke-width=".6" data-e="tank_top">${fmt(top, 1)}°</text>
      <text x="180" y="322" text-anchor="middle" font-size="12" fill="#fff" opacity=".9">${warmPct === null ? '' : warmPct + '% warm'}</text>
      <!-- sensoren -->
      ${onlyMid ? `
      <circle cx="244" cy="286" r="4" fill="#fff" stroke="#555"/><line x1="248" y1="286" x2="276" y2="286" stroke="#8a96a3"/>
      <text x="280" y="284" class="lbl">Midden</text><text x="280" y="300" class="val" data-e="tank_temp">${fmt(top, 1, '°')}</text>` : `
      <circle cx="244" cy="198" r="4" fill="#fff" stroke="#555"/><line x1="248" y1="198" x2="276" y2="198" stroke="#8a96a3"/>
      <text x="280" y="196" class="lbl">Boven</text><text x="280" y="212" class="val" data-e="tank_top">${fmt(top, 1, '°')}</text>
      <circle cx="244" cy="376" r="4" fill="#fff" stroke="#555"/><line x1="248" y1="376" x2="276" y2="376" stroke="#8a96a3"/>
      <text x="280" y="374" class="lbl">Onder</text><text x="280" y="390" class="val" data-e="tank_bottom">${fmt(bottom, 1, '°')}</text>`}
      <!-- warmtepompmodule -->
      <rect x="90" y="44" width="180" height="104" rx="36" fill="url(#${u}b)" stroke="#bfc8d1"/>
      <rect x="90" y="122" width="180" height="6" fill="#0a5aa5" opacity=".85"/>
      <circle cx="148" cy="92" r="32" fill="#eef1f4" stroke="#aab4be"/>
      <g class="fan" data-e="compressor">
        <path d="M148 92 q-4 -26 10 -26 q6 14 -10 26z M148 92 q26 -4 26 10 q-14 6 -26 -10z M148 92 q4 26 -10 26 q-6 -14 10 -26z M148 92 q-26 4 -26 -10 q14 -6 26 10z" fill="#7f8c99"/>
      </g>
      <circle cx="148" cy="92" r="5" fill="#4b5661"/>
      <circle cx="148" cy="92" r="32" fill="none" stroke="#aab4be" stroke-dasharray="2 4"/>
      <!-- display -->
      <rect x="196" y="68" width="62" height="48" rx="8" fill="#0d2740" data-e="setpoint"/>
      <text x="227" y="96" text-anchor="middle" font-size="19" font-weight="700" fill="#5ed0ff" data-e="setpoint">${fmt(setpoint, 0)}°</text>
      <text x="227" y="110" text-anchor="middle" font-size="9" fill="#9fb8cc">${mode}</text>
      <circle cx="205" cy="76" r="2.5" fill="${fault ? '#ff3b30' : hp ? '#39d353' : '#6b7a89'}"/>
      <!-- luchtstroom -->
      <g fill="none" stroke="#2f80d0" stroke-width="3" stroke-linecap="round" opacity="${hp ? 1 : .25}">
        <path ${hp ? 'class="airin"' : ''} d="M52 80 h26 m-8 -7 l8 7 l-8 7"/>
        <path ${hp ? 'class="airin" style="animation-delay:.5s"' : ''} d="M52 104 h26 m-8 -7 l8 7 l-8 7"/>
        <path ${hp ? 'class="airin" style="animation-delay:.3s"' : ''} d="M282 92 h26 m-8 -7 l8 7 l-8 7" stroke="#8a96a3"/>
      </g>
      ${this._has('air_in') ? `<text x="8" y="126" class="lbl">Lucht in</text><text x="8" y="141" class="val" data-e="air_in">${fmt(this._n('air_in'), 1, '°')}</text>` : ''}
      ${this._has('air_out') ? `<text x="282" y="118" class="lbl">Lucht uit</text><text x="282" y="133" class="val" data-e="air_out">${fmt(this._n('air_out'), 1, '°')}</text>` : ''}
    </svg>`;

    const chips = [
      `<span class="chip ${hp ? 'on' : ''}" data-e="compressor">Warmtepomp ${hp ? 'actief' : 'rust'}</span>`,
      heater ? `<span class="chip heat" data-e="heater">Element aan</span>` : '',
      boost ? `<span class="chip heat">Boost</span>` : '',
      this._on('pv_boost') ? `<span class="chip heat" data-e="pv_boost">PV Boost</span>` : '',
      away ? `<span class="chip">Afwezig</span>` : '',
      fault ? `<span class="chip warn" data-e="fault">Storing</span>` : '',
    ].join('');

    const et = this._n('energy_total');
    const stats = [
      this._has('available_liters') ? `<div class="stat" data-e="available_liters"><b>${fmt(this._n('available_liters'), 0, ' L')}</b><span>Beschikbaar</span></div>` : '',
      this._has('remaining_minutes') ? `<div class="stat" data-e="remaining_minutes"><b>${fmt(this._n('remaining_minutes'), 0, ' min')}</b><span>Resterend</span></div>` : '',
      this._has('cop') ? `<div class="stat" data-e="cop"><b>${fmt(this._n('cop'), 2)}</b><span>COP laatste cyclus</span></div>` : '',
      this._has('power') ? `<div class="stat" data-e="power"><b>${fmt(power, 0, ' W')}</b><span>Vermogen</span></div>` : '',
      this._has('energy_today') ? `<div class="stat" data-e="energy_today"><b>${fmt(this._n('energy_today'), 2, ' kWh')}</b><span>Vandaag</span></div>` : '',
      this._has('energy_total') ? `<div class="stat" data-e="energy_total"><b>${fmt(et, isNum(et) && et < 100 ? 2 : 0, ' kWh')}</b><span>Verbruik totaal</span></div>` : '',
    ].join('');

    this._shell({ t: c.title, s: isNum(setpoint) ? 'Ingesteld op ' + fmt(setpoint, 0, '°C') : '' }, svg + `<div class="chips">${chips}</div>` + (stats ? `<div class="stats">${stats}</div>` : ''));
  }
}

/* ------------------------------------------------------------------ */
/*  Panasonic monoblock, zonder buffervat                              */
/* ------------------------------------------------------------------ */
class PanasonicMonoblockCard extends WPBase {
  static defaults() { return { title: 'Warmtepomp', show_radiators: true, show_floor: true }; }
  static getStubConfig() {
    return { type: 'custom:panasonic-monoblock-card', entities: { supply: 'sensor.aanvoer', return: 'sensor.retour' } };
  }

  _render() {
    if (!this._hass || !this._c) return;
    const c = this._c;
    const sup = this._n('supply'), ret = this._n('return');
    const flow = this._n('flow');
    const power = this._n('power');
    const heatSensor = this._n('heat_power');
    const compHz = this._n('comp_hz');
    const ambient = this._n('ambient');
    const setpoint = this._n('setpoint');
    const defrost = this._on('defrost');
    const faultSt = this._st('fault');
    const fault = !!faultSt && !['0', 'off', 'none', 'no fault', 'unknown', 'unavailable', ''].includes(String(faultSt.state).toLowerCase());
    const dT = isNum(sup) && isNum(ret) ? sup - ret : null;

    let heat = heatSensor;
    if (!isNum(heat) && isNum(flow) && isNum(dT)) heat = Math.max(0, flow * 69.77 * dT); // L/min * 4186/60 * dT
    const cop = isNum(heat) && isNum(power) && power > 50 ? heat / power : null;

    let running = false;
    if (isNum(compHz)) running = compHz > 0;
    else if (this._has('compressor')) running = this._on('compressor');
    else if (isNum(power)) running = power > 100;
    else if (isNum(flow)) running = flow > 1;

    const circulating = running || (isNum(flow) && flow > 1);
    const supC = tempColor(sup, 20, 55), retC = tempColor(ret, 20, 55);
    const avgC = tempColor(isNum(sup) && isNum(ret) ? (sup + ret) / 2 : null, 20, 55);
    const flowDur = isNum(flow) ? clamp(3.2 - flow * 0.18, 0.6, 3.2) : 1.6;
    const fanDur = isNum(compHz) && compHz > 0 ? clamp(2 - compHz / 60, 0.5, 2) : 1.1;
    const showR = c.show_radiators !== false, showF = c.show_floor !== false;
    const floorOn = showF && (this._has('floor_pump') ? this._on('floor_pump') : true) && circulating;
    const radOn = showR && (this._has('radiator_pump') ? this._on('radiator_pump') : true) && circulating;
    const fl = (on, col, w = 3) => on
      ? `<path class="flowline" style="--flow:${flowDur}s" stroke="#ffffff" stroke-opacity=".7" stroke-width="${w}" fill="none" d="PATH"/>` : '';

    // paden
    const pSupplyMain = 'M124 100 H256 V205';
    const pReturnMain = 'M124 192 V256 H404 V118';
    const pRadTo = 'M256 118 H276', pRadFrom = 'M384 118 H404';
    const pFloorTo = 'M256 205 H276', pFloorFrom = 'M384 205 H404 V118';
    const fins = Array.from({ length: 8 }, (_, i) => `<rect x="${282 + i * 12}" y="100" width="8" height="38" rx="3" fill="${radOn ? avgC : '#aab4be'}"/>`).join('');
    const zig = 'M276 205 q0 -14 12 -14 h72 q12 0 12 14 q0 14 -12 14 h-72 q-12 0 -12 14 q0 14 12 14 h72 q12 0 12 -14';
    const u = this._uid;

    const svg = `
    <svg viewBox="0 0 440 290" class="${running ? 'run' : ''}" style="--fan:${fanDur}s">
      <!-- huis -->
      <polygon points="230,70 330,18 430,70" fill="var(--secondary-background-color)" stroke="#aab4be" stroke-width="2"/>
      <rect x="240" y="70" width="180" height="200" fill="none" stroke="#aab4be" stroke-width="2"/>
      <line x1="240" y1="160" x2="420" y2="160" stroke="#aab4be" stroke-dasharray="4 5" opacity=".6"/>
      <!-- leidingen -->
      <path d="${pReturnMain}" fill="none" stroke="${retC}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${pSupplyMain}" fill="none" stroke="${supC}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      ${fl(circulating, supC).replace('PATH', pSupplyMain)}
      ${fl(circulating, retC).replace('PATH', pReturnMain)}
      ${showR ? `
        <path d="${pRadTo}" stroke="${supC}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="${pRadFrom}" stroke="${retC}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <rect x="276" y="96" width="108" height="46" rx="6" fill="none" stroke="#8a96a3" stroke-width="2"/>${fins}
        <text x="330" y="156" text-anchor="middle" class="lbl">Radiatoren</text>` : ''}
      ${showF ? `
        <path d="${pFloorTo}" stroke="${supC}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="${pFloorFrom}" stroke="${retC}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="${zig}" fill="none" stroke="${floorOn ? avgC : '#aab4be'}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        ${floorOn ? `<path class="flowline" style="--flow:${flowDur}s" d="${zig}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5"/>` : ''}
        <text x="330" y="250" text-anchor="middle" class="lbl">Vloerverwarming</text>` : ''}
      <!-- buitenunit -->
      <ellipse cx="69" cy="262" rx="62" ry="6" fill="#000" opacity=".12"/>
      <rect x="12" y="50" width="114" height="206" rx="12" fill="#e9edf1" stroke="#aab4be" stroke-width="2"/>
      <circle cx="69" cy="112" r="44" fill="#f7f9fb" stroke="#aab4be"/>
      <g class="fan" data-e="comp_hz">
        <path d="M69 112 q-5 -34 13 -34 q8 18 -13 34z M69 112 q34 -5 34 13 q-18 8 -34 -13z M69 112 q5 34 -13 34 q-8 -18 13 -34z M69 112 q-34 5 -34 -13 q18 -8 34 13z" fill="#7f8c99"/>
      </g>
      <circle cx="69" cy="112" r="6" fill="#4b5661"/>
      <circle cx="69" cy="112" r="44" fill="none" stroke="#aab4be" stroke-dasharray="2 4"/>
      <rect x="26" y="176" width="86" height="64" rx="8" fill="#d7dde3"/>
      <text x="69" y="200" text-anchor="middle" class="lbl">Compressor</text>
      <text x="69" y="222" text-anchor="middle" class="val" data-e="comp_hz">${isNum(compHz) ? fmt(compHz, 0, ' Hz') : running ? 'aan' : 'uit'}</text>
      <text x="69" y="42" text-anchor="middle" class="lbl" data-e="ambient">Buiten ${fmt(ambient, 1, '°')}</text>
      ${defrost ? `<rect x="22" y="136" width="94" height="20" rx="10" fill="#e8590c"/><text x="69" y="150" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">ONTDOOIEN</text>` : ''}
      <!-- temperaturen -->
      <text x="190" y="88" text-anchor="middle" class="lbl">Aanvoer</text>
      <text x="190" y="120" text-anchor="middle" class="val" data-e="supply" fill="${supC}" style="fill:${supC}">${fmt(sup, 1, '°')}</text>
      <text x="190" y="214" text-anchor="middle" class="lbl">Retour</text>
      <text x="190" y="242" text-anchor="middle" class="val" data-e="return" style="fill:${retC}">${fmt(ret, 1, '°')}</text>
      ${isNum(flow) ? `<text x="190" y="170" text-anchor="middle" class="lbl" data-e="flow">${fmt(flow, 1, ' L/min')}</text>` : ''}
    </svg>`;

    const modeS = this._st('mode');
    const chips = [
      `<span class="chip ${running ? 'on' : ''}">${running ? 'Verwarmt' : 'Rust'}</span>`,
      defrost ? `<span class="chip heat">Ontdooien</span>` : '',
      fault ? `<span class="chip warn" data-e="fault">Storing ${faultSt.state}</span>` : '',
      modeS ? `<span class="chip" data-e="mode">${modeS.state}</span>` : '',
      isNum(setpoint) ? `<span class="chip" data-e="setpoint">Doel ${fmt(setpoint, 1, '°')}</span>` : '',
      this._has('thermostat') ? `<span class="chip" data-e="thermostat">Kamer ${fmt(parseFloat(this._attr('thermostat', 'current_temperature')), 1, '°')}</span>` : '',
    ].join('');

    const stats = `
      <div class="stat" data-e="power"><b>${fmt(power, 0, ' W')}</b><span>Verbruik</span></div>
      <div class="stat" data-e="heat_power"><b>${fmt(heat, 0, ' W')}</b><span>Warmte-afgifte</span></div>
      <div class="stat"><b>${fmt(cop, 1)}</b><span>COP${heatSensor === null && cop !== null ? ' (geschat)' : ''}</span></div>
      ${this._has('energy_today') ? `<div class="stat" data-e="energy_today"><b>${fmt(this._n('energy_today'), 1, ' kWh')}</b><span>Vandaag</span></div>` : ''}`;

    this._shell({ t: c.title, s: isNum(dT) ? 'ΔT ' + fmt(dT, 1, ' K') : '' }, svg + `<div class="chips">${chips}</div><div class="stats">${stats}</div>`);
  }
}

customElements.define('atlantic-explorer-card', AtlanticExplorerCard);
customElements.define('panasonic-monoblock-card', PanasonicMonoblockCard);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: 'atlantic-explorer-card', name: 'Atlantic Explorer V5', description: 'Geanimeerde kaart voor een Atlantic Explorer V5 warmtepompboiler', preview: false },
  { type: 'panasonic-monoblock-card', name: 'Panasonic monoblock', description: 'Geanimeerde kaart voor een Panasonic monoblock zonder buffervat', preview: false }
);

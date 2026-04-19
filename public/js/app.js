const API_BASE = window.location.origin;
const REFRESH_INTERVAL = 15000;

let map, allVehicles = [], markers = {}, selectedId = null;
let refreshTimer = null;

// ── Map init ──
map = L.map('map', {
  center: [33.749, -84.388],
  zoom: 12,
  zoomControl: false,
  attributionControl: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19
}).addTo(map);

// ── Fetch & render ──
async function fetchVehicles() {
  try {
    const resp = await fetch(`${API_BASE}/api/vehicles`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    allVehicles = data.vehicles || [];
    setLive(true);
    hideError();
    renderAll();
    updateStats();
    updateTime();
    populateRouteFilter();
  } catch (err) {
    setLive(false);
    showError('无法获取实时数据: ' + err.message);
    console.error(err);
  } finally {
    hideLoading();
  }
}

function renderAll() {
  const routeFilter = document.getElementById('route-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const search = document.getElementById('search').value.toLowerCase();

  const filtered = allVehicles.filter(v => {
    if (routeFilter && v.route !== routeFilter) return false;
    if (statusFilter && v.status !== statusFilter) return false;
    if (search && !v.id.toLowerCase().includes(search) && !v.route.toLowerCase().includes(search)) return false;
    return true;
  });

  // Remove markers no longer in filtered
  const filteredIds = new Set(filtered.map(v => v.id));
  Object.keys(markers).forEach(id => {
    if (!filteredIds.has(id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  filtered.forEach(v => {
    const isMoving = v.status === 'IN_TRANSIT_TO';
    const isSelected = v.id === selectedId;
    const label = v.route || '?';

    if (markers[v.id]) {
      markers[v.id].setLatLng([v.lat, v.lng]);
      const el = markers[v.id].getElement();
      if (el) {
        el.className = `bus-marker ${isMoving ? 'moving' : 'stopped'}${isSelected ? ' selected' : ''}`;
        el.textContent = label;
      }
    } else {
      const icon = L.divIcon({
        className: '',
        html: `<div class="bus-marker ${isMoving ? 'moving' : 'stopped'}${isSelected ? ' selected' : ''}">${label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const marker = L.marker([v.lat, v.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 });
      marker.on('click', () => selectVehicle(v.id));
      marker.addTo(map);
      markers[v.id] = marker;
    }
  });

  renderList(filtered);
  document.getElementById('list-count').textContent = `${filtered.length} 辆车`;
}

function renderList(vehicles) {
  const list = document.getElementById('vehicle-list');
  if (vehicles.length === 0) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;font-family:var(--mono)">无匹配车辆</div>`;
    return;
  }
  list.innerHTML = vehicles.map(v => {
    const moving = v.status === 'IN_TRANSIT_TO';
    const speedKmh = v.speed ? Math.round(v.speed * 3.6) : 0;
    return `
      <div class="vehicle-item ${v.id === selectedId ? 'active' : ''}" onclick="selectVehicle('${v.id}')">
        <div class="v-route-badge">${v.route || '?'}</div>
        <div class="v-id">${v.label || v.id}</div>
        <div class="v-sub">
          <span class="v-status-dot ${moving ? 'moving' : 'stopped'}"></span>
          ${moving ? '行驶中' : '停靠中'}
        </div>
        <div class="v-speed">${speedKmh > 0 ? speedKmh + ' km/h' : ''}</div>
      </div>`;
  }).join('');
}

function updateStats() {
  document.getElementById('stat-total').textContent = allVehicles.length;
  document.getElementById('stat-moving').textContent = allVehicles.filter(v => v.status === 'IN_TRANSIT_TO').length;
  document.getElementById('stat-stopped').textContent = allVehicles.filter(v => v.status === 'STOPPED_AT').length;
  const routes = new Set(allVehicles.map(v => v.route).filter(Boolean));
  document.getElementById('stat-routes').textContent = routes.size;
}

function populateRouteFilter() {
  const sel = document.getElementById('route-filter');
  const cur = sel.value;
  const routes = [...new Set(allVehicles.map(v => v.route).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">全部线路</option>' +
    routes.map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${r}</option>`).join('');
}

// ── Vehicle selection ──
function selectVehicle(id) {
  selectedId = id;
  const v = allVehicles.find(v => v.id === id);
  if (!v) return;

  map.panTo([v.lat, v.lng], { animate: true });

  // Update marker styles
  Object.keys(markers).forEach(mid => {
    const el = markers[mid].getElement();
    if (!el) return;
    const vv = allVehicles.find(x => x.id === mid);
    if (!vv) return;
    const isMoving = vv.status === 'IN_TRANSIT_TO';
    el.className = `bus-marker ${isMoving ? 'moving' : 'stopped'}${mid === id ? ' selected' : ''}`;
    markers[mid].setZIndexOffset(mid === id ? 1000 : 0);
  });

  showDetail(v);
  renderList(allVehicles.filter(x => document.getElementById('route-filter').value ? x.route === document.getElementById('route-filter').value : true));
}

function showDetail(v) {
  const card = document.getElementById('detail-card');
  card.classList.remove('hidden');

  document.getElementById('detail-route').textContent = `线路 ${v.route || '—'}`;
  document.getElementById('detail-id').textContent = `车辆 ID: ${v.label || v.id}`;

  const speedKmh = v.speed ? Math.round(v.speed * 3.6) : '—';
  const bearing = v.bearing != null ? v.bearing + '°' : '—';
  const ts = v.timestamp ? new Date(v.timestamp * 1000).toLocaleTimeString('zh-CN') : '—';

  document.getElementById('detail-grid').innerHTML = `
    <div class="detail-cell"><label>状态</label><span style="color:${v.status === 'IN_TRANSIT_TO' ? 'var(--green)' : 'var(--amber)'}">${v.status === 'IN_TRANSIT_TO' ? '行驶中' : '停靠中'}</span></div>
    <div class="detail-cell"><label>速度</label><span>${speedKmh !== '—' ? speedKmh + ' km/h' : '—'}</span></div>
    <div class="detail-cell"><label>方向</label><span>${bearing}</span></div>
    <div class="detail-cell"><label>更新时间</label><span style="font-size:11px">${ts}</span></div>
    <div class="detail-cell"><label>纬度</label><span>${v.lat.toFixed(5)}</span></div>
    <div class="detail-cell"><label>经度</label><span>${v.lng.toFixed(5)}</span></div>
  `;

  const stops = v.stopTimeUpdates || [];
  const stopsEl = document.getElementById('detail-stops');
  if (stops.length > 0) {
    stopsEl.innerHTML = `<h4>即将到站</h4>` + stops.map(s => {
      const t = s.arrival || s.departure;
      const timeStr = t ? new Date(t * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—';
      return `<div class="stop-row"><span class="stop-id">${s.stopId || '—'}</span><span class="stop-time">${timeStr}</span></div>`;
    }).join('');
  } else {
    stopsEl.innerHTML = '';
  }
}

function closeDetail() {
  selectedId = null;
  document.getElementById('detail-card').classList.add('hidden');
  Object.keys(markers).forEach(id => {
    const el = markers[id].getElement();
    if (!el) return;
    const v = allVehicles.find(x => x.id === id);
    if (!v) return;
    el.className = `bus-marker ${v.status === 'IN_TRANSIT_TO' ? 'moving' : 'stopped'}`;
    markers[id].setZIndexOffset(0);
  });
  renderAll();
}

// ── UI helpers ──
function setLive(live) {
  const el = document.getElementById('live-indicator');
  el.className = 'indicator ' + (live ? 'live' : 'offline');
  el.innerHTML = `<span class="dot"></span> ${live ? 'LIVE' : 'OFFLINE'}`;
}

function showError(msg) {
  const el = document.getElementById('error-toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function hideError() {
  document.getElementById('error-toast').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function updateTime() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString('zh-CN');
}

function manualRefresh() {
  clearTimeout(refreshTimer);
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '↻ 加载中…';
  fetchVehicles().finally(() => {
    btn.disabled = false;
    btn.textContent = '↻ 刷新';
    scheduleRefresh();
  });
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    fetchVehicles().finally(scheduleRefresh);
  }, REFRESH_INTERVAL);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── Filter listeners ──
document.getElementById('route-filter').addEventListener('change', renderAll);
document.getElementById('status-filter').addEventListener('change', renderAll);
document.getElementById('search').addEventListener('input', renderAll);
map.on('click', e => {
  if (e.originalEvent.target === map.getContainer().querySelector('canvas') || e.originalEvent.target.classList.contains('leaflet-tile')) {
    closeDetail();
  }
});

// ── Start ──
fetchVehicles().finally(scheduleRefresh);

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

const VEHICLE_URL = 'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle';
const TRIP_UPDATE_URL = 'https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate';

let vehicleCache = null;
let lastFetch = 0;
const CACHE_TTL = 15000;

async function fetchGtfsRt(url) {
  const GtfsRealtimeBindings = await import('gtfs-realtime-bindings');
  const resp = await fetch(url, {
    headers: { 
      'Accept': 'application/x-protobuf',
      'User-Agent': 'Mozilla/5.0'
    },
    redirect: 'manual'
  });
  
  if (resp.status === 301 || resp.status === 302) {
    let redirectUrl = resp.headers.get('location');
    redirectUrl = redirectUrl.replace('http://', 'https://');
    console.log('Redirecting to:', redirectUrl);
    const resp2 = await fetch(redirectUrl, {
      headers: {
        'Accept': 'application/x-protobuf, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.itsmarta.com/',
        'Accept-Encoding': 'gzip, deflate, br',
      }
    });
    if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
    const buf = await resp2.arrayBuffer();
    return GtfsRealtimeBindings.default.transit_realtime.FeedMessage.decode(new Uint8Array(buf));
  }
  
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return GtfsRealtimeBindings.default.transit_realtime.FeedMessage.decode(new Uint8Array(buf));
}

async function refreshData() {
  const now = Date.now();
  if (now - lastFetch < CACHE_TTL) return;
  lastFetch = now;
  try {
    const [vehicles, trips] = await Promise.all([
      fetchGtfsRt(VEHICLE_URL),
      fetchGtfsRt(TRIP_UPDATE_URL)
    ]);
    const tripMap = {};
    trips.entity.forEach(e => {
      if (e.tripUpdate?.trip?.tripId) {
        tripMap[e.tripUpdate.trip.tripId] = {
          routeId: e.tripUpdate.trip.routeId,
          stopTimeUpdates: (e.tripUpdate.stopTimeUpdate || []).slice(0, 5).map(s => ({
            stopId: s.stopId,
            arrival: s.arrival?.time ? Number(s.arrival.time) : null,
            departure: s.departure?.time ? Number(s.departure.time) : null,
          }))
        };
      }
    });
    vehicleCache = vehicles.entity
      .filter(e => e.vehicle?.position)
      .map(e => {
        const v = e.vehicle;
        const tripId = v.trip?.tripId;
        const tripInfo = tripMap[tripId] || {};
        return {
          id: v.vehicle?.id || e.id,
          label: v.vehicle?.label || v.vehicle?.id || e.id,
          route: v.trip?.routeId || tripInfo.routeId || '?',
          tripId: tripId || null,
          lat: v.position.latitude,
          lng: v.position.longitude,
          bearing: v.position.bearing || 0,
          speed: v.position.speed || 0,
          status: v.currentStatus || 'IN_TRANSIT_TO',
          stopId: v.stopId || null,
          timestamp: v.timestamp ? Number(v.timestamp) : null,
          stopTimeUpdates: tripInfo.stopTimeUpdates || []
        };
      });
    console.log(`[${new Date().toISOString()}] Refreshed: ${vehicleCache.length} vehicles`);
  } catch (err) {
    console.error('Fetch error:', err.message);
    if (!vehicleCache) vehicleCache = [];
  }
}

app.get('/api/vehicles', async (req, res) => {
  try {
    await refreshData();
    res.json({ ok: true, timestamp: Date.now(), count: vehicleCache.length, vehicles: vehicleCache });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/vehicles/:id', async (req, res) => {
  await refreshData();
  const v = vehicleCache?.find(v => v.id === req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, vehicle: v });
});

app.get('/api/stats', async (req, res) => {
  await refreshData();
  const routes = [...new Set((vehicleCache || []).map(v => v.route).filter(Boolean))];
  res.json({ ok: true, total: vehicleCache?.length || 0, routes: routes.sort(), lastUpdate: lastFetch });
});

app.listen(PORT, () => {
  console.log(`MARTA Tracker running at http://localhost:${PORT}`);
  refreshData();
});

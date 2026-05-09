"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Trash2 } from "lucide-react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CONFIG = {
  databaseUrl: "https://smart-circuit-monitor-default-rtdb.asia-southeast1.firebasedatabase.app",
  devicePath: "devices/esp32-s3-devkitm-1/ina219",
  pollMs: Number(process.env.NEXT_PUBLIC_POLL_MS || 2000),
  historyLimit: Number(process.env.NEXT_PUBLIC_HISTORY_LIMIT || 180),
  shortThresholdMA: Number(process.env.NEXT_PUBLIC_SHORT_THRESHOLD_MA || 10),
};

const CHART_RANGES = [
  { id: "2m", label: "2m", ms: 2 * 60 * 1000 },
  { id: "5m", label: "5m", ms: 5 * 60 * 1000 },
  { id: "10m", label: "10m", ms: 10 * 60 * 1000 },
  { id: "all", label: "All", ms: null },
];

function formatVoltage(value) {
  return `${Math.abs(Number(value || 0)).toFixed(3)} V`;
}

function formatCurrent(value) {
  return `${Math.abs(Number(value || 0)).toFixed(1)} mA`;
}

function formatPower(value) {
  return `${Math.abs(Number(value || 0)).toFixed(1)} mW`;
}

function formatRssi(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)} dBm` : "-- dBm";
}

function positiveMagnitude(value) {
  return Math.abs(Number(value || 0));
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remain}s`;
  return `${remain}s`;
}

function formatTimeStamp(key, item) {
  const sampleTime = Number(item?.sampleTime ?? item?.timestamp ?? key);
  if (Number.isFinite(sampleTime) && sampleTime >= 0 && sampleTime < 1_000_000_000) {
    return formatDuration(sampleTime);
  }

  if (item?.timestamp) {
    const date = new Date(Number(item.timestamp));
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }

  const numericKey = Number(key);
  if (Number.isFinite(numericKey)) {
    if (numericKey >= 0 && numericKey < 1_000_000_000) return formatDuration(numericKey);
    const date = new Date(numericKey);
    if (!Number.isNaN(date.getTime()) && numericKey > 1_000_000_000) return date.toLocaleString();
  }

  return String(key || "unknown");
}

function normalizeItem(key, item) {
  const data = item || {};
  const keyNumber = Number(key);
  const uptimeNumber = Number(data.uptime_ms ?? 0);
  const sampleTime = Number.isFinite(keyNumber) && keyNumber > 0 ? keyNumber : uptimeNumber;
  const busVoltage = positiveMagnitude(data.busVoltage ?? data.busV ?? 0);
  const current_mA = positiveMagnitude(data.current_mA ?? 0);
  const power_mW = positiveMagnitude(data.power_mW ?? 0);
  const shuntVoltage_mV = positiveMagnitude(data.shuntVoltage_mV ?? 0);

  return {
    key,
    sampleTime,
    timestamp: data.timestamp ?? sampleTime,
    busVoltage,
    current_mA,
    power_mW,
    shuntVoltage_mV,
    wifi_rssi_dBm: Number(data.wifi_rssi_dBm ?? data.wifiRssi ?? NaN),
    status: String(data.status ?? "normal").toLowerCase(),
    shortCircuit: Boolean(data.shortCircuit ?? String(data.status ?? "") === "shortcircuit"),
    uptime_ms: Number(data.uptime_ms ?? 0),
    raw: data,
  };
}

function buildFirebaseUrl(path, searchParams = {}) {
  const base = `${CONFIG.databaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}.json`;
  const url = new URL(base);
  Object.entries(searchParams).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  return url.toString();
}

async function fetchJson(path, searchParams = {}) {
  const url = buildFirebaseUrl(path, searchParams);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadLatest() {
  const latest = await fetchJson(`${CONFIG.devicePath}/latest`);
  if (!latest) return null;
  return normalizeItem("latest", latest);
}

async function loadDeviceEvents(deviceBase) {
  try {
    const data = await fetchJson(`${deviceBase}/events`);
    if (!data) return {};
    return data;
  } catch (e) {
    return {};
  }
}

async function loadHistory() {
  const data = await fetchJson(`${CONFIG.devicePath}/history`, {
    orderBy: '"$key"',
    limitToLast: CONFIG.historyLimit,
  });
  if (!data) return [];
  return Object.entries(data)
    .map(([key, item]) => normalizeItem(key, item))
    .sort((a, b) => Number(a.key) - Number(b.key));
}

function buildSeries(history) {
  const points = history
    .map((item, index) => {
      const t = Number(item.sampleTime ?? item.timestamp ?? item.key ?? index);
      return {
        ...item,
        time: Number.isFinite(t) ? t : index,
        magnitude: positiveMagnitude(item.current_mA),
      };
    })
    .sort((a, b) => a.time - b.time);

  const startTime = points.length ? points[0].time : 0;
  const endTime = points.length ? points[points.length - 1].time : 0;
  const timeSpan = Math.max(1, endTime - startTime);

  const spans = [];
  let active = null;
  points.forEach((point) => {
    if (point.shortCircuit) {
      if (!active) active = { start: point.time, end: point.time, points: 1 };
      else {
        active.end = point.time;
        active.points += 1;
      }
    } else if (active) {
      spans.push(active);
      active = null;
    }
  });
  if (active) spans.push(active);

  return { points, spans, startTime, endTime, timeSpan };
}

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const sampled = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) sampled.push(points[Math.round(i * step)]);
  return sampled;
}

function buildEventSummary(series) {
  const totalShortMs = series.spans.reduce((t, s) => t + Math.max(0, s.end - s.start), 0);
  const lastSpan = series.spans.length ? series.spans[series.spans.length - 1] : null;
  const longestSpan = series.spans.reduce((longest, span) => {
    if (!longest) return span;
    return Math.max(0, span.end - span.start) > Math.max(0, longest.end - longest.start) ? span : longest;
  }, null);
  return { count: series.spans.length, totalShortMs, lastSpan, longestSpan };
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getRangeLabel(rangeId) {
  return CHART_RANGES.find((range) => range.id === rangeId)?.label || "All";
}

function buildChartWindow(series, rangeId) {
  const range = CHART_RANGES.find((item) => item.id === rangeId) || CHART_RANGES[3];
  const endTime = series.endTime;
  const startTime = range.ms ? Math.max(series.startTime, endTime - range.ms) : series.startTime;

  const points = series.points
    .filter((item) => item.time >= startTime)
    .map((item) => ({
      ...item,
      absoluteCurrent: positiveMagnitude(item.current_mA),
      absolutePower: positiveMagnitude(item.power_mW),
      timeLabel: formatDuration(Math.max(0, item.time - startTime)),
    }));

  const spans = series.spans.filter((span) => span.end >= startTime).map((span) => ({
    ...span,
    start: Math.max(span.start, startTime),
    end: Math.max(span.end, startTime),
  }));

  const peakCurrent = points.reduce((peak, item) => Math.max(peak, item.absoluteCurrent), 0);
  const shortEventCount = points.filter((item) => item.shortCircuit).length;

  return {
    range,
    startTime,
    endTime,
    points,
    spans,
    peakCurrent,
    shortEventCount,
    duration: Math.max(1, endTime - startTime),
  };
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="chart-tooltip">
      <span className={`chart-tooltip-badge ${point.shortCircuit ? "is-hot" : ""}`}>
        {point.shortCircuit ? "SHORTCIRCUIT" : "NORMAL"}
      </span>
      <strong>{label}</strong>
      <div>
        <span>Current</span>
        <strong>{formatCurrent(point.absoluteCurrent ?? point.current_mA)}</strong>
      </div>
      <div>
        <span>Bus voltage</span>
        <strong>{formatVoltage(point.busVoltage)}</strong>
      </div>
      <div>
        <span>Power</span>
        <strong>{formatPower(point.absolutePower ?? point.power_mW)}</strong>
      </div>
      <div>
        <span>Uptime</span>
        <strong>{point.uptime_ms ? formatDuration(point.uptime_ms) : "--"}</strong>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);
  const [chartRange, setChartRange] = useState("10m");
  const [deviceEvents, setDeviceEvents] = useState({});
  const chartContainerRef = useRef(null);

  const series = useMemo(() => buildSeries(history), [history]);
  const eventSummary = useMemo(() => buildEventSummary(series), [series]);
  const chartWindow = useMemo(() => buildChartWindow(series, chartRange), [series, chartRange]);
  const chartData = useMemo(() => downsample(chartWindow.points, 180), [chartWindow.points]);

  useEffect(() => {
    let mounted = true;

    async function refresh() {
      let nextLatest = null;
      let nextHistory = [];
      let latestError = null;
      let historyError = null;

      try {
        nextLatest = await loadLatest();
      } catch (e) {
        latestError = e;
      }

      try {
        nextHistory = await loadHistory();
      } catch (e) {
        historyError = e;
      }

      // load device-scoped events (acknowledgements etc.)
      try {
        const deviceBase = CONFIG.devicePath.split("/").slice(0, 2).join("/");
        const nextEvents = await loadDeviceEvents(deviceBase);
        setDeviceEvents(nextEvents || {});
      } catch (e) {
        // ignore event loading errors
      }

      if (!nextLatest && nextHistory.length) {
        nextLatest = nextHistory[nextHistory.length - 1];
      }

      if (!mounted) return;
      setLatest(nextLatest);
      setHistory(nextHistory);
      setOnline(Boolean(nextLatest || nextHistory.length));
      setError(latestError || historyError);
      setSyncedAt(new Date());
    }

    refresh();
    const timer = setInterval(refresh, CONFIG.pollMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current) {
        chartContainerRef.current.dataset.resizedAt = String(Date.now());
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const status = latest?.shortCircuit || latest?.status === "shortcircuit" ? "shortcircuit" : "normal";

  const eventMain = (() => {
    if (!eventSummary.lastSpan) {
      return {
        state: "No short-circuit yet",
        title: "Waiting for a short event",
        desc: "When current crosses threshold, start/end time window and duration will appear here.",
      };
    }

    const lastStart = formatTimeStamp(String(eventSummary.lastSpan.start), {
      sampleTime: eventSummary.lastSpan.start,
      timestamp: eventSummary.lastSpan.start,
    });
    const lastEnd = formatTimeStamp(String(eventSummary.lastSpan.end), {
      sampleTime: eventSummary.lastSpan.end,
      timestamp: eventSummary.lastSpan.end,
    });
    const lastDuration = formatDuration(Math.max(0, eventSummary.lastSpan.end - eventSummary.lastSpan.start));
    const longest = eventSummary.longestSpan
      ? formatDuration(Math.max(0, eventSummary.longestSpan.end - eventSummary.longestSpan.start))
      : "0s";

    return {
      state: "Short-circuit detected",
      title: `${lastStart} to ${lastEnd}`,
      desc: `Last window lasted ${lastDuration}. Longest event so far: ${longest}.`,
    };
  })();

  const chartPeak = chartWindow.peakCurrent || 0;
  const chartSummaryText = history.length
    ? `${chartData.length} samples | ${chartWindow.spans.length} short windows | peak ${chartPeak.toFixed(1)} mA | ${getRangeLabel(chartRange)}`
    : error
      ? `Firebase unavailable: ${error.message}`
      : "Waiting for history...";

  async function acknowledgeEvent(span) {
    try {
      const deviceBase = CONFIG.devicePath.split("/").slice(0, 2).join("/");
      const url = buildFirebaseUrl(`${deviceBase}/events/${span.start}`);
      const body = { acknowledged: true, ack_ts: Date.now(), span: { start: span.start, end: span.end } };
      await fetch(url, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      setDeviceEvents((prev) => ({ ...(prev || {}), [span.start]: body }));
    } catch (e) {
      console.error("ack event failed", e);
    }
  }

  async function clearEvent(span) {
    try {
      const deviceBase = CONFIG.devicePath.split("/").slice(0, 2).join("/");
      const url = buildFirebaseUrl(`${deviceBase}/events/${span.start}`);
      await fetch(url, { method: "DELETE" });
      setDeviceEvents((prev) => {
        const copy = { ...(prev || {}) };
        delete copy[span.start];
        return copy;
      });
    } catch (e) {
      console.error("clear event failed", e);
    }
  }

  return (
    <>
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="noise" />

      <main className={`shell ${status === "shortcircuit" ? "is-short" : ""}`}>
        <header className="topbar glass">
          <div className="brand">
            <div className="brand-mark">SS</div>
            <div>
              <p className="eyebrow">OPTOSAFE-AN live monitoring</p>
              <h1>OPTOSAFE-AN</h1>
            </div>
          </div>
          <div className="topbar-meta">
            <div className="live-pill">{online ? "online" : "offline"}</div>
            <div className="mono small">
              {online && syncedAt ? `Synced ${syncedAt.toLocaleTimeString()}` : "Waiting for Firebase"}
            </div>
          </div>
        </header>

        <section className="hero grid-hero">
          <article className="glass hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">IOT BASED SHORT CIRCUIT PROTECTION SYSTEM WIHT LIVE MONITORING</p>
              <h2>Advanced live protection console with dynamic event intelligence.</h2>
              <p className="lede">
                Built with strong hierarchy, motion, high-contrast surfaces, and event-first visualization across desktop and mobile.
              </p>
            </div>
            <div className="hero-badges">
              <div className="chip chip-live">{status}</div>
              <div className="chip">{formatVoltage(latest?.busVoltage)}</div>
              <div className="chip">{formatCurrent(latest?.current_mA)}</div>
              <div className="chip">{formatPower(latest?.power_mW)}</div>
            </div>
          </article>

          <aside className="glass stats-panel">
            <div className="ring-wrap">
              <div className={`ring ${status === "shortcircuit" ? "shortcircuit" : ""}`}>
                <div>
                  <span className="ring-label">Circuit</span>
                  <strong id="stateWord">{status === "shortcircuit" ? "SHORT" : "NORMAL"}</strong>
                </div>
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <span>Bus voltage</span>
                <strong>{formatVoltage(latest?.busVoltage)}</strong>
              </div>
              <div className="stat-card">
                <span>Current</span>
                <strong>{formatCurrent(latest?.current_mA)}</strong>
              </div>
              <div className="stat-card">
                <span>Power</span>
                <strong>{formatPower(latest?.power_mW)}</strong>
              </div>
              <div className="stat-card">
                <span>Wi-Fi RSSI</span>
                <strong>{formatRssi(latest?.wifi_rssi_dBm)}</strong>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid-main">
          <article className="glass chart-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Interactive graph</p>
                <h3>Current history with short-circuit windows</h3>
              </div>
              <div className="legend">
                <span>
                  <i className="dot dot-normal" /> normal
                </span>
                <span>
                  <i className="dot dot-danger" /> shortcircuit
                </span>
              </div>
            </div>
            <div className="chart-toolbar">
              <div className="chart-range-group">
                {CHART_RANGES.map((range) => (
                  <button
                    key={range.id}
                    type="button"
                    className={`chart-range-button ${chartRange === range.id ? "active" : ""}`}
                    onClick={() => setChartRange(range.id)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <div className="chart-stats">
                <span>{chartWindow.points.length} points</span>
                <span>{chartWindow.spans.length} short windows</span>
                <span>{chartPeak.toFixed(1)} mA peak</span>
              </div>
            </div>
            <div className="chart-shell chart-shell-recharts" ref={chartContainerRef}>
              {typeof window !== "undefined" && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <ComposedChart data={chartWindow.points} margin={{ top: 16, right: 28, left: 4, bottom: 12 }}>
                  <defs>
                    <linearGradient id="currentArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#62f2ff" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#62f2ff" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="shortSpan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff5b87" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#ff5b87" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(146, 210, 255, 0.12)" strokeDasharray="4 8" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    tickFormatter={(value) => formatDuration(Math.max(0, value - chartWindow.startTime))}
                    stroke="rgba(148, 169, 199, 0.95)"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    tickFormatter={(value) => `${Number(value).toFixed(0)}mA`}
                    stroke="rgba(148, 169, 199, 0.95)"
                    domain={[0, Math.max(CONFIG.shortThresholdMA, chartPeak || CONFIG.shortThresholdMA)]}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: 12 }}
                  />
                  <ReferenceLine
                    y={CONFIG.shortThresholdMA}
                    stroke="#ff5b87"
                    strokeDasharray="8 8"
                    label={{
                      value: `${CONFIG.shortThresholdMA}mA threshold`,
                      position: "insideTopRight",
                      fill: "#ffb2c4",
                      fontSize: 11,
                    }}
                  />
                  {chartWindow.spans.map((span, index) => (
                    <ReferenceArea
                      key={`${span.start}-${span.end}`}
                      x1={span.start}
                      x2={span.end}
                      fill="url(#shortSpan)"
                      stroke="rgba(255, 91, 135, 0.2)"
                      strokeOpacity={0.25}
                      ifOverflow="extendDomain"
                      isFront={false}
                    />
                  ))}
                  <Area
                    type="monotone"
                    dataKey="absoluteCurrent"
                    name="Current"
                    stroke="#62f2ff"
                    strokeWidth={3}
                    fill="url(#currentArea)"
                    dot={false}
                    activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1.5 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="busVoltage"
                    name="Bus Voltage"
                    stroke="#81a4ff"
                    strokeWidth={2}
                    dot={false}
                    strokeOpacity={0.75}
                    isAnimationActive={false}
                  />
                  <Brush
                    dataKey="time"
                    height={28}
                    travellerWidth={10}
                    stroke="#62f2ff"
                    tickFormatter={(value) => formatDuration(Math.max(0, value - chartWindow.startTime))}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              )}
              <div className="chart-hint">{chartSummaryText}</div>
            </div>
          </article>

          <article className="glass detail-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Packet and event console</p>
                <h3>Live status packet</h3>
              </div>
            </div>

            <dl className="payload-list">
              <div>
                <dt>Status</dt>
                <dd>{latest?.status || "--"}</dd>
              </div>
              <div>
                <dt>Short circuit</dt>
                <dd>{latest ? String(Boolean(latest.shortCircuit || latest.status === "shortcircuit")) : "--"}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{latest ? "live snapshot" : "--"}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{latest?.uptime_ms ? `${Math.round(latest.uptime_ms / 1000)} s` : "--"}</dd>
              </div>
            </dl>

            <div className="payload-json">{latest ? safeJson(latest.raw) : "Awaiting Firebase data..."}</div>

            <div className="event-panel">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Incident timeline</p>
                  <h3>Event windows</h3>
                </div>
                <div className="mono small">{eventSummary.count} events</div>
              </div>

              <div className="event-summary">
                <div className="event-summary-main">
                  <span className={`event-state ${eventSummary.count ? "event-hot" : "event-idle"}`}>{eventMain.state}</span>
                  <strong>{eventMain.title}</strong>
                  <p>{eventMain.desc}</p>
                </div>
                <div className="event-summary-metrics">
                  <div>
                    <span>Last event</span>
                    <strong>
                      {eventSummary.lastSpan
                        ? formatTimeStamp(String(eventSummary.lastSpan.end), {
                            sampleTime: eventSummary.lastSpan.end,
                            timestamp: eventSummary.lastSpan.end,
                          })
                        : "--"}
                    </strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>
                      {eventSummary.lastSpan
                        ? formatDuration(Math.max(0, eventSummary.lastSpan.end - eventSummary.lastSpan.start))
                        : "--"}
                    </strong>
                  </div>
                  <div>
                    <span>Total short time</span>
                    <strong>{eventSummary.count ? formatDuration(eventSummary.totalShortMs) : "--"}</strong>
                  </div>
                </div>
              </div>

              <div className="event-strip">
                {eventSummary.count === 0 ? (
                  <div className="event-empty">No short-circuit windows captured yet.</div>
                ) : (
                  series.spans
                    .slice(-4)
                    .reverse()
                    .map((span, index) => {
                      const startLabel = formatTimeStamp(String(span.start), {
                        sampleTime: span.start,
                        timestamp: span.start,
                      });
                      const endLabel = formatTimeStamp(String(span.end), {
                        sampleTime: span.end,
                        timestamp: span.end,
                      });
                      const duration = formatDuration(Math.max(0, span.end - span.start));
                      return (
                        <div
                          key={`${span.start}-${span.end}`}
                          className={`event-strip-item ${index === 0 ? "event-strip-item-focus" : ""}`}
                        >
                          <span>{index === 0 ? "Latest" : `#${series.spans.length - index}`}</span>
                          <strong>{startLabel} to {endLabel}</strong>
                          <small>{duration}</small>
                          <div className="event-actions">
                            {deviceEvents && deviceEvents[span.start] && deviceEvents[span.start].acknowledged ? (
                              <button className="ack-button acknowledged" title="Acknowledged">
                                <Check size={14} /> Acknowledged
                              </button>
                            ) : (
                              <motion.button
                                whileTap={{ scale: 0.96 }}
                                className="ack-button"
                                onClick={() => acknowledgeEvent(span)}
                              >
                                <Check size={14} /> Acknowledge
                              </motion.button>
                            )}
                            <motion.button
                              whileTap={{ scale: 0.96 }}
                              className="ack-button muted"
                              onClick={() => clearEvent(span)}
                              title="Clear event"
                            >
                              <Trash2 size={14} /> Clear
                            </motion.button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </article>
        </section>

        <section className="glass feed-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Telemetry feed</p>
              <h3>Last telemetry samples</h3>
            </div>
            <div className="mono small">{history.length} points | {eventSummary.count} short events</div>
          </div>

          <div className="feed-grid">
            {!history.length ? (
              <div className="feed-empty">No history yet. The device will populate this panel on next upload.</div>
            ) : (
              history
                .slice(-4)
                .reverse()
                .map((item) => (
                  <article key={item.key} className={`feed-card ${item.shortCircuit ? "shortcircuit" : ""}`}>
                    <span className="mini-status">{item.status}</span>
                    <strong>{formatCurrent(item.current_mA)} | {formatVoltage(item.busVoltage)}</strong>
                    <small>{formatTimeStamp(item.key, item)} uptime</small>
                    <p>{formatPower(item.power_mW)} | RSSI {formatRssi(item.wifi_rssi_dBm)}</p>
                  </article>
                ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}

// NotionChart.tsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";

import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import "./NotionChart.css";

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

interface ChartDataPoint {
  label: string;
  value: number;
}

interface ChartItem {
  title: string;
  slot: number;
  data: ChartDataPoint[];
}

interface ApiResponse {
  charts: ChartItem[];
}

interface SortableBaseProps {
  id: string;
  baseName: string;
  items: ChartItem[];
}

function SortableBase({ id, baseName, items }: SortableBaseProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`sortable-base${isDragging ? " dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <h2 className="chart-title">{baseName}</h2>
      <div className="chart-grid">
        {items.map((chart) => {
          const total = chart.data.reduce((acc, d) => acc + d.value, 0);
          const data = {
            labels: chart.data.map((d) => d.label),
            datasets: [
              {
                data: chart.data.map((d) => d.value),
                backgroundColor: ["#94999dff", "#ff4069", "#36a2eb", "#277f53"],
                borderWidth: 0,
              },
            ],
          };

          const options: ChartOptions<"doughnut"> = {
            cutout: "75%",
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 800,
              easing: "easeOutCubic",
            },
            plugins: {
              legend: { display: true, position: "bottom" },
              tooltip: {
                callbacks: {
                  label: (ctx: any) => {
                    const label = ctx.label || "";
                    const value = ctx.parsed || 0;
                    const percent =
                      total > 0 ? Math.round((value / total) * 100) : 0;
                    return `${label} ${value} (${percent}%)`;
                  },
                },
              },
              datalabels: { display: false },
            },
          };

          return (
            <div key={`${baseName}-${chart.slot}`} className="chart-container">
              <h3 className="chart-title">
                {chart.title.split("::")[1] || `Slot ${chart.slot}`}
              </h3>
              <div className="chart-wrapper">
                <Doughnut data={data} options={options} />
                <div className="chart-center">
                  <span className="chart-total">{total}</span>
                  <span className="chart-total-label">Total</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NotionChart() {
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [selectedBases, setSelectedBases] = useState<string[]>(["all"]);
  const [orderedBases, setOrderedBases] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const chartsRef = useRef<ChartItem[]>([]);

  // --- WS management refs/state ---
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const [wsStatus, setWsStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  const MAX_RECONNECT_ATTEMPTS = 8;

  const fetchData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error("API URL not set");

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const json: ApiResponse = await res.json();
      setCharts(json.charts || []);
      chartsRef.current = json.charts || [];
      setLastUpdated(new Date());

      if (!orderedBases.length && json.charts?.length) {
        const bases = Array.from(
          new Set(json.charts.map((c) => c.title.split("::")[0]))
        );
        setOrderedBases(bases);
      }
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Helpers for WS lifecycle ---
  const clearHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const startHeartbeat = (ws: WebSocket) => {
    clearHeartbeat();
    // Send a heartbeat every 25s (adjust as needed), so intermediaries don't close idle connections.
    const id = window.setInterval(() => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        }
      } catch (err) {
        // swallow — if sending fails, ws.onclose will handle reconnect
      }
    }, 25000);
    heartbeatIntervalRef.current = id;
  };

  const stopReconnectTimeout = () => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const scheduleReconnect = (delayMs?: number) => {
    stopReconnectTimeout();
    const attempt = reconnectAttemptsRef.current + 1;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.warn("Max reconnect attempts reached.");
      setWsStatus("disconnected");
      return;
    }
    reconnectAttemptsRef.current = attempt;
    const base =
      typeof delayMs === "number"
        ? delayMs
        : Math.min(1000 * 2 ** attempt, 30000);
    console.log(`Plan reconnect in ${base}ms (attempt ${attempt})`);
    reconnectTimeoutRef.current = window.setTimeout(() => {
      connectWebsocket(); // eslint-disable-line @typescript-eslint/no-use-before-define
    }, base);
  };

  const forceCloseWs = () => {
    stopReconnectTimeout();
    clearHeartbeat();
    reconnectAttemptsRef.current = 0;
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close(1000, "Client requested reconnect");
        }
      } catch {}
      wsRef.current = null;
    }
    setWsStatus("disconnected");
  };

  // connectWebsocket defined as stable callback
  const connectWebsocket = useCallback(() => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      console.error("❌ Brak zmiennej VITE_WS_URL");
      setWsStatus("disconnected");
      return;
    }

    // If already have a socket in connecting/open state, don't create a second one
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      console.log(
        "WebSocket already open or connecting — skipping new connect"
      );
      return;
    }

    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("🔌 WebSocket połączony:", wsUrl);
      setWsStatus("connected");
      reconnectAttemptsRef.current = 0;
      startHeartbeat(ws);
    };

    ws.onclose = (ev) => {
      console.log("❌ WebSocket rozłączony", ev.code, ev.reason);
      setWsStatus("disconnected");
      clearHeartbeat();
      wsRef.current = null;
      // schedule reconnect
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error("WebSocket error", err);
      // let onclose handle reconnect flow
    };

    ws.onmessage = async (event) => {
      try {
        const updatedData = JSON.parse(event.data);

        // If server replies to ping with pong, ignore (optional)
        if (updatedData?.type === "pong") {
          // server responded to our ping — good
          return;
        }

        // Allow the server to broadcast an 'update' envelope, or even a direct 'charts' payload
        if (updatedData.type !== "update" || !updatedData.charts?.charts)
          return;

        const updatedCharts = chartsRef.current.map((chart) => {
          const updatedChart = updatedData.charts.charts.find(
            (c: ChartItem) => c.title === chart.title && c.slot === chart.slot
          );
          return updatedChart || chart;
        });

        chartsRef.current = updatedCharts;
        setCharts(updatedCharts);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Błąd przy aktualizacji danych z WS:", err);
      }
    };
  }, []);

  // Establish WS on mount
  useEffect(() => {
    connectWebsocket();
    return () => {
      // cleanup on unmount
      forceCloseWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // Optional: reconnect when tab becomes visible again (helps when browser throttles in background)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // if disconnected -> attempt reconnect
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          console.log("Tab visible — attempting reconnect");
          connectWebsocket();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer (unchanged)
  useEffect(() => {
    const wrappers = document.querySelectorAll(".chart-wrapper");
    if (!wrappers.length) return;

    const observer = new ResizeObserver(() => {
      for (const chart of Object.values(ChartJS.instances)) {
        (chart as ChartJS).resize();
      }
    });

    wrappers.forEach((w) => observer.observe(w));
    return () => observer.disconnect();
  }, [charts]);

  // Selection logic unchanged...
  const baseList = Array.from(
    new Set(charts.map((c) => c.title.split("::")[0]))
  );
  const allSelected =
    selectedBases.includes("all") || selectedBases.length === baseList.length;

  const toggleBase = (base: string) => {
    if (base === "all") {
      setSelectedBases(["all"]);
      return;
    }
    if (selectedBases.includes("all")) {
      setSelectedBases([base]);
      return;
    }
    if (selectedBases.includes(base)) {
      const filtered = selectedBases.filter((b) => b !== base);
      setSelectedBases(filtered.length ? filtered : ["all"]);
    } else {
      const added = [...selectedBases, base];
      if (added.length === baseList.length) setSelectedBases(["all"]);
      else setSelectedBases(added);
    }
  };

  const filteredCharts = allSelected
    ? charts
    : charts.filter((c) => selectedBases.includes(c.title.split("::")[0]));
  const grouped: Record<string, ChartItem[]> = {};
  filteredCharts.forEach((c) => {
    const base = c.title.split("::")[0];
    if (!grouped[base]) grouped[base] = [];
    grouped[base].push(c);
  });
  Object.keys(grouped).forEach((base) =>
    grouped[base].sort((a, b) => a.slot - b.slot)
  );

  const displayedBases = orderedBases.filter(
    (b) => allSelected || selectedBases.includes(b)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedBases((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // UI handlers for manual reconnect / refresh
  const handleManualReconnect = async () => {
    console.log("Ręczne odświeżenie połączenia WS — wymuszam reconnect");
    forceCloseWs();
    // short delay before trying to reconnect
    window.setTimeout(() => {
      reconnectAttemptsRef.current = 0;
      connectWebsocket();
    }, 250);
  };

  // small control: also allow manual full refresh of data from API
  const handleManualRefreshData = async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  };

  if (loading) return <p>⏳ Ładowanie danych...</p>;
  if (!charts.length) return <p>⚠️ Brak danych do wyświetlenia</p>;
  if (!displayedBases.length) return <p>⚠️ Brak wybranych baz</p>;

  return (
    <div className={`notion-app ${theme}`} style={{ padding: 20 }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div className="base-selector">
          <button onClick={() => setDropdownOpen((prev) => !prev)}>
            {allSelected
              ? "Wszystkie bazy"
              : `${selectedBases.length} baza(-y)`}{" "}
            ▼
          </button>
          {dropdownOpen && (
            <div className="base-dropdown">
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => toggleBase("all")}
                />{" "}
                Wszystkie
              </label>
              {baseList.map((base) => (
                <label key={base}>
                  <input
                    type="checkbox"
                    checked={allSelected || selectedBases.includes(base)}
                    onChange={() => toggleBase(base)}
                  />{" "}
                  {base}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* 🌙☀️ Przycisk zmiany trybu */}
          <button
            className={`theme-toggle ${theme}`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "☀️/🌙" : "🌙/☀️"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Nowy: ręczne odświeżenie połączenia WS */}
          <button
            className="btn-reconnect"
            onClick={handleManualReconnect}
            title="Wymuś ponowne połączenie WebSocket"
          >
            🔄 Odśwież połączenie
          </button>

          {/* Opcjonalnie: ręczne odświeżenie danych z API */}
          <button
            className="btn-reconnect"
            onClick={handleManualRefreshData}
            title="Pobierz dane z API"
          >
            ↻ Odśwież dane
          </button>

          {/* status WS */}
          <div style={{ marginLeft: 8 }}>
            {wsStatus === "connected" ? (
              <span>🔌 Połączony</span>
            ) : wsStatus === "connecting" ? (
              <span>🔁 Łączenie...</span>
            ) : (
              <span>❌ Rozłączony</span>
            )}
          </div>
        </div>
      </div>

      {lastUpdated && (
        <p>Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={displayedBases}
          strategy={verticalListSortingStrategy}
        >
          {displayedBases.map((base) => (
            <SortableBase
              key={base}
              id={base}
              baseName={base}
              items={grouped[base]}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

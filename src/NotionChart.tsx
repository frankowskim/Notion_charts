import React, { useEffect, useState } from "react";
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

  const fetchData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error("API URL not set");

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const json: ApiResponse = await res.json();
      setCharts(json.charts || []);
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

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_API_URL;
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log("WebSocket połączony");
    ws.onclose = () => console.log("WebSocket rozłączony");

    ws.onmessage = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(apiUrl);
        const json: ApiResponse = await res.json();
        const newCharts = json.charts || [];

        // Tworzymy nową tablicę, aby wymusić rerender wszystkich wykresów
        setCharts([...newCharts]);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Błąd przy pobieraniu danych po WS:", err);
      }
    };

    return () => ws.close();
  }, []);

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

  if (loading) return <p>⏳ Ładowanie danych...</p>;
  if (!charts.length) return <p>⚠️ Brak danych do wyświetlenia</p>;
  if (!displayedBases.length) return <p>⚠️ Brak wybranych baz</p>;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
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
        {lastUpdated && (
          <p>Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}</p>
        )}
      </div>

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

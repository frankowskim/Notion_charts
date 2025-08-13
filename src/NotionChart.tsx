import React, { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  DragEndEvent
} from '@dnd-kit/core';

import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';

import { CSS } from '@dnd-kit/utilities';

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

interface ChartDataPoint {
  label: string;
  value: number;
}

interface ChartItem {
  title: string; // format: "BaseName::ChildName"
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
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : undefined,
    opacity: isDragging ? 0.8 : 1,
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'white',
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <h2>{baseName}</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {items.map(chart => {
          const total = chart.data.reduce((acc, d) => acc + d.value, 0);

          const data = {
            labels: chart.data.map(d => d.label),
            datasets: [
              {
                data: chart.data.map(d => d.value),
                backgroundColor: ['#94999dff', '#36a2eb', '#ff4069', '#277f53'],
                borderWidth: 0
              }
            ]
          };

          const options: ChartOptions<'doughnut'> = {
            cutout: '75%',
            plugins: {
              legend: {
                display: true,
                position: 'bottom' // literal type OK
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const label = ctx.label || '';
                    const value = ctx.parsed as number || 0;
                    const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                    return `${label} ${value} (${percent}%)`;
                  }
                }
              },
              datalabels: { display: false }
            }
          };

          return (
            <div
              key={`${baseName}-${chart.slot}`}
              style={{
                width: 180,
                position: 'relative',
                textAlign: 'center',
                boxShadow: '0 0 5px rgba(0,0,0,0.1)',
                borderRadius: 8,
                padding: 8,
                backgroundColor: '#f9f9f9',
              }}
            >
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                {chart.title.split('::')[1] || `Slot ${chart.slot}`}
              </h3>
              <Doughnut data={data} options={options} />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontWeight: 'bold',
                  fontSize: 18,
                  pointerEvents: 'none',
                }}
              >
                {total}
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

  const [selectedBases, setSelectedBases] = useState<string[]>(['all']);
  const [orderedBases, setOrderedBases] = useState<string[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('API URL not set');

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const json: ApiResponse = await res.json();
      setCharts(json.charts || []);
      setLastUpdated(new Date());

      if (!orderedBases.length && json.charts?.length) {
        const bases = Array.from(new Set(json.charts.map(c => c.title.split('::')[0])));
        setOrderedBases(bases);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) return;

    const socket = new WebSocket(wsUrl.startsWith('ws') ? wsUrl : `wss://${wsUrl}`);
    socket.onopen = () => console.log('WebSocket connected');
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'update') {
          fetchData();
        }
      } catch {}
    };
    socket.onclose = () => console.warn('WebSocket closed');

    return () => socket.close();
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const baseList = Array.from(new Set(charts.map(c => c.title.split('::')[0])));
  const allSelected = selectedBases.includes('all') || selectedBases.length === baseList.length;

  const toggleBase = (base: string) => {
    if (base === 'all') {
      setSelectedBases(['all']);
      return;
    }
    if (selectedBases.includes('all')) {
      setSelectedBases([base]);
      return;
    }
    if (selectedBases.includes(base)) {
      const filtered = selectedBases.filter(b => b !== base);
      setSelectedBases(filtered.length ? filtered : ['all']);
    } else {
      const added = [...selectedBases, base];
      if (added.length === baseList.length) setSelectedBases(['all']);
      else setSelectedBases(added);
    }
  };

  const filteredCharts = allSelected ? charts : charts.filter(c => selectedBases.includes(c.title.split('::')[0]));
  const grouped: Record<string, ChartItem[]> = {};
  filteredCharts.forEach(c => {
    const base = c.title.split('::')[0];
    if (!grouped[base]) grouped[base] = [];
    grouped[base].push(c);
  });
  Object.keys(grouped).forEach(base => {
    grouped[base].sort((a, b) => a.slot - b.slot);
  });

  const displayedBases = orderedBases.filter(b => allSelected || selectedBases.includes(b));

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
        <strong>Wybierz bazy:</strong><br />
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => toggleBase('all')}
          /> Wszystkie
        </label>
        {baseList.map(base => (
          <label key={base} style={{ marginLeft: 12 }}>
            <input
              type="checkbox"
              checked={selectedBases.includes(base) || allSelected}
              onChange={() => toggleBase(base)}
            /> {base}
          </label>
        ))}
      </div>

      <div style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
        Ostatnia aktualizacja: {lastUpdated?.toLocaleTimeString() || '-'}
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
          {displayedBases.map(baseName => {
            const itemsForBase = grouped[baseName];
            if (!itemsForBase) return null;
            return (
              <SortableBase
                key={baseName}
                id={baseName}
                baseName={baseName}
                items={itemsForBase}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}

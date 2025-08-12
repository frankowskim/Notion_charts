import { useEffect, useRef, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './NotionChart.css';

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

type StatusLabel = 'Not started' | 'Await' | 'In progress' | 'Done';

interface ChartDataPoint {
  label: StatusLabel;
  value: number;
}

interface ChartItem {
  title: string; // "NazwaBazy::NazwaRodzica"
  slot: number;
  data: ChartDataPoint[]; // aggregated counts per status
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : undefined,
    boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.2)' : undefined,
    cursor: 'grab',
    backgroundColor: 'white',
    padding: '12px',
    marginBottom: '12px',
    borderRadius: '8px',
    border: '1px solid #ccc',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <h2 className="text-lg font-bold mb-4 cursor-grab">{baseName}</h2>
      <div className="chart-grid">
        {items.map((chart) => {
          const total = chart.data.reduce((s, d) => s + (d.value ?? 0), 0);
          const labels = chart.data.map(d => d.label);
          const values = chart.data.map(d => d.value);

          return (
            <div key={`${baseName}-${chart.slot}`} className="chart-container">
              <h3 className="chart-title">{chart.title.split('::')[1] ?? `Slot ${chart.slot}`}</h3>
              <Doughnut
                data={{
                  labels,
                  datasets: [
                    {
                      data: values,
                      backgroundColor: ['#94999dff', '#36a2eb', '#ff4069', '#277f53'],
                      borderWidth: 0,
                    }
                  ]
                }}
                options={{
                  cutout: '75%',
                  plugins: {
                    datalabels: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const label = context.label ?? '';
                          const idx = context.dataIndex ?? 0;
                          const value = values[idx] ?? 0;
                          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                          return `${label} ${value} (${percentage}%)`;
                        }
                      }
                    },
                    legend: {
                      display: true,
                      position: 'bottom',
                      labels: {
                        font: { size: 12 },
                        boxWidth: 16,
                      }
                    }
                  }
                }}
              />
              <div className="chart-center">
                <span className="chart-total">{total}</span>
                <span className="chart-total-label">Total</span>
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
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedBases, setSelectedBases] = useState<string[]>(['all']);
  const [orderedBases, setOrderedBases] = useState<string[]>([]);
  const ws = useRef<WebSocket | null>(null);

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('API URL not set');

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const json: ApiResponse = await res.json();
      setCharts(json.charts || []);
      setLastUpdated(new Date());

      // Initialize order if empty
      const bases = Array.from(new Set(json.charts.map(c => c.title.split('::')[0])));
      setOrderedBases(prev => prev.length ? prev.filter(b => bases.includes(b)) : bases);
    } catch (err) {
      console.error('❌ Błąd podczas pobierania danych:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      console.warn('Brak VITE_WS_URL — WebSocket wyłączony');
      return;
    }

    const url = wsUrl.startsWith('ws') ? wsUrl : `wss://${wsUrl}`;
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => console.log('✅ Połączono z WebSocketem');
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'update') {
          fetchData();
        }
      } catch (e) {}
    };
    socket.onerror = (e) => console.error('❌ WebSocket error', e);
    socket.onclose = () => console.warn('⚠️ WebSocket closed');

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <p>⏳ Ładowanie danych z Notion...</p>;
  if (!charts || charts.length === 0) return <p>⚠️ Brak danych do wyświetlenia.</p>;

  const baseList: string[] = Array.from(new Set(charts.map(c => c.title.split('::')[0])));
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
      const newSel = selectedBases.filter(b => b !== base);
      setSelectedBases(newSel.length ? newSel : ['all']);
    } else {
      const newSel = [...selectedBases, base];
      if (newSel.length === baseList.length) {
        setSelectedBases(['all']);
      } else {
        setSelectedBases(newSel);
      }
    }
  };

  // Filter charts by selected bases
  const filteredCharts = selectedBases.includes('all')
    ? charts
    : charts.filter(c => selectedBases.includes(c.title.split('::')[0]));

  // Group charts by baseName
  const grouped: Record<string, ChartItem[]> = {};
  filteredCharts.forEach(c => {
    const baseName = c.title.split('::')[0];
    if (!grouped[baseName]) grouped[baseName] = [];
    grouped[baseName].push(c);
  });

  // Sort each group's charts by slot
  Object.keys(grouped).forEach(baseName => {
    grouped[baseName].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  });

  // Sort bases according to orderedBases, and filter only selected
  const displayedBases = orderedBases.filter(b => selectedBases.includes('all') || selectedBases.includes(b));

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderedBases.indexOf(active.id as string);
      const newIndex = orderedBases.indexOf(over.id as string);
      setOrderedBases(arrayMove(orderedBases, oldIndex, newIndex));
    }
  };

  return (
    <div>
      {/* Multi-select dropdown */}
      <div className="relative inline-block mb-4">
        <button
          type="button"
          onClick={() => {}}
          className="border rounded-lg px-3 py-2 bg-white shadow-sm min-w-[200px]"
        >
          {/* Just placeholder - dropdown can be implemented similarly as before if needed */}
          {allSelected ? 'Wszystkie bazy' : `${selectedBases.length} wybrane`}
        </button>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500 mb-4">
          Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {selectedBases.length === 0 || (selectedBases.length === 1 && selectedBases[0] === '') ? (
        <p>⚠️ Żadne bazy nie są wybrane.</p>
      ) : displayedBases.length === 0 ? (
        <p>⚠️ Brak wybranych baz do wyświetlenia.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayedBases}
            strategy={verticalListSortingStrategy}
          >
            {displayedBases.map(baseName => (
              <SortableBase
                key={baseName}
                id={baseName}
                baseName={baseName}
                items={grouped[baseName]}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
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
    opacity: isDragging ? 0.8 : 1,
    cursor: 'grab',
  };

  const totalSum = items.reduce(
    (sum, chart) => sum + chart.data.reduce((s, d) => s + (d.value ?? 0), 0),
    0
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="sortable-base">
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

      // Aktualizacja orderedBases na podstawie pobranych danych
      const bases = Array.from(new Set((json.charts || []).map(c => c.title.split('::')[0])));
      setOrderedBases(prev => {
        if (prev.length) {
          // Usuwamy bazy, które już nie istnieją
          return prev.filter(b => bases.includes(b));
        }
        return bases;
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <p>⏳ Ładowanie danych z Notion...</p>;
  if (!charts || charts.length === 0) return <p>⚠️ Brak danych do wyświetlenia.</p>;

  const baseList: string[] = Array.from(new Set(charts.map(c => c.title.split('::')[0])));
  const allSelected = selectedBases.includes('all') || selectedBases.length === baseList.length;

  // Funkcja do wyboru baz (checkboxy)
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

  // Filtracja wykresów wg wybranych baz
  const filteredCharts = selectedBases.includes('all')
    ? charts
    : charts.filter(c => selectedBases.includes(c.title.split('::')[0]));

  // Grupowanie wg bazy
  const grouped: Record<string, ChartItem[]> = {};
  filteredCharts.forEach(c => {
    const baseName = c.title.split('::')[0];
    if (!grouped[baseName]) grouped[baseName] = [];
    grouped[baseName].push(c);
  });
  // Sortowanie wykresów wg slotu
  Object.keys(grouped).forEach(baseName => {
    grouped[baseName].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  });

  // Lista baz do wyświetlenia w kolejności orderedBases, tylko te które są w selectedBases
  const displayedBases = orderedBases.filter(b => (allSelected || selectedBases.includes(b)));

  // DnD-kit sensors
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

  return (
    <div>
      {/* Dropdown wyboru baz */}
      <div className="relative inline-block mb-4">
        <button
          type="button"
          onClick={() => setDropdownOpen(o => !o)}
          className="border rounded-lg px-3 py-2 bg-white shadow-sm hover:border-gray-400 focus:outline-none min-w-[200px] flex justify-between items-center"
        >
          {allSelected ? 'Wszystkie bazy' : `${selectedBases.length} wybrane`}
          <span className={`ml-2 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>
        <AnimatePresence>
          {dropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
            >
              <div className="px-3 py-2 border-b border-gray-200">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={allSelected}
                    onChange={() => toggleBase('all')}
                  />
                  <span className="text-sm font-medium">Wszystkie</span>
                </label>
              </div>
              {baseList.map((b) => (
                <div key={b} className="px-3 py-2 hover:bg-gray-50">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedBases.includes(b) || allSelected}
                      onChange={() => toggleBase(b)}
                    />
                    <span className="text-sm">{b}</span>
                  </label>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500 mb-4">
          Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {/* Jeśli nie ma wybranych baz (czyli lista pusta), pokaż komunikat */}
      {displayedBases.length === 0 ? (
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
            {displayedBases.map(baseName => {
              const itemsForBase = grouped[baseName];
              if (!itemsForBase) return null; // ochrona
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
      )}
    </div>
  );
}

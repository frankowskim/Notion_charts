import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
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

export default function NotionChart() {
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedBases, setSelectedBases] = useState<string[]>(['all']);
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
    } catch (err) {
      console.error('❌ Błąd podczas pobierania danych:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // WebSocket auto-refresh — on 'update' message just re-fetch (server sends only when data changed)
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
          // backend signaled update -> fetch new aggregated charts
          fetchData();
        }
      } catch (e) {
        // ignore non-json messages
      }
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

  // list of bases extracted from title "BaseName::ParentTitle"
  const baseList: string[] = Array.from(new Set(charts.map(c => c.title.split('::')[0])));

  const handleBaseChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const opts = e.target.options;
    const sel: string[] = [];
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].selected) sel.push(opts[i].value);
    }
    if (sel.includes('all')) setSelectedBases(['all']);
    else setSelectedBases(sel);
  };

  // Filter charts by selected bases
  const filteredCharts = selectedBases.includes('all')
    ? charts
    : charts.filter(c => selectedBases.includes(c.title.split('::')[0]));

  // Group by baseName and then map slot -> chart
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

  return (
    <div>
      <div className="flex items-center mb-4">
        <label className="mr-2">Wybierz bazy:</label>
        <select multiple value={selectedBases} onChange={handleBaseChange} className="border rounded px-2 py-1">
          <option value="all">Wszystkie</option>
          {baseList.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500 mb-4">
          Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {Object.entries(grouped).map(([baseName, items]) => (
        <div key={baseName} className="mb-8">
          <h2 className="text-lg font-bold mb-4">{baseName}</h2>
          <div className="chart-grid">
            {items.map((chart) => {
              const total = chart.data.reduce((s, d) => s + (d.value ?? 0), 0);
              // Ensure ordering of statuses for consistent colors
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
      ))}
    </div>
  );
}

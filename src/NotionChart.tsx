import { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

interface ChartItem {
  title: string;
  slot: number | null;
  data: {
    label: string;
    value: number;
  }[];
}

export default function NotionChart() {
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL is not defined in environment variables');
      }

      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: ChartItem[] = await res.json();
      setCharts(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('❌ Błąd podczas pobierania danych:', err);
    } finally {
      setLoading(false);
    }
  };

  // 🕒 Automatyczne pobieranie danych co 60 sekund
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>⏳ Ładowanie danych z Notion...</p>;
  if (!charts || charts.length === 0) return <p>⚠️ Brak danych do wyświetlenia.</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Wykresy z Notion</h2>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          onClick={fetchData}
        >
          🔄 Odśwież dane
        </button>
      </div>

      {lastUpdated && (
        <p className="text-sm text-gray-500 mb-4">
          Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {charts.map((chart, index) => {
        const total = chart.data.reduce((sum, d) => sum + (d?.value ?? 0), 0);

        return (
          <div key={index} className="relative" style={{ width: '320px', marginBottom: '2rem' }}>
            <h3 className="font-semibold mb-2">{chart.title}</h3>
            <Doughnut
              data={{
                labels: chart.data.map(
                  (d) => `${d.label} ${d.value} (${((d.value / total) * 100).toFixed(0)}%)`
                ),
                datasets: [
                  {
                    data: chart.data.map((d) => d.value),
                    backgroundColor: ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCE56'],
                    borderWidth: 0,
                  }
                ]
              }}
              options={{
                cutout: '75%',
                plugins: {
                  datalabels: {
                    display: false
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        const label = context.label || '';
                        return `${label}`;
                      }
                    }
                  },
                  legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                      font: {
                        size: 12,
                      },
                      boxWidth: 16,
                    }
                  }
                }
              }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ fontWeight: 700, fontSize: 48, lineHeight: 1, color: '#d0d0d0', pointerEvents: 'none', fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              {total}
              <div style={{ fontWeight: 400, fontSize: 16, color: '#999', marginTop: -4 }}>
                Total
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

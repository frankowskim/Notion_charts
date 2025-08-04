import { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

export default function NotionChart() {
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);

 useEffect(() => {
  fetch(import.meta.env.VITE_API_URL)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then(data => {
      console.log("Dane z backendu:", data);
      setCharts(data);
      setLoading(false);
    })
    .catch(err => {
      console.error("Błąd podczas pobierania:", err);
      setLoading(false);
    });
}, []);

  if (loading) return <p>⏳ Ładowanie danych z Notion...</p>;
  if (!charts || charts.length === 0) return <p>⚠️ Brak danych do wyświetlenia.</p>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Wykresy z Notion</h2>
      {charts.map((chart, index) => (
        <div key={index} style={{ width: '300px', marginBottom: '2rem' }}>
          <h3 className="text-lg font-semibold mb-2">{chart.title}</h3>
          <Pie
            data={{
              labels: chart.data.map(d => d.label),
              datasets: [{
                data: chart.data.map(d => d.value),
                backgroundColor: [
                  '#FF6384',
                  '#36A2EB',
                  '#FFCE56',
                  '#4BC0C0'
                ]
              }]
            }}
            options={{
              plugins: {
                datalabels: {
                  color: '#000',
                  font: {
                    size: 16,
                    weight: 'bold',
                  },
                  formatter: (value) => value,
                },
                legend: {
                  position: 'bottom',
                  labels: {
                    font: {
                      size: 14,
                    }
                  }
                }
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}

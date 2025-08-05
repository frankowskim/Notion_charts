import { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import './NotionChart.css'; // Importuj osobny plik CSS

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

const [lastUpdatedTimestamp, setLastUpdatedTimestamp] = useState<number | null>(null);
const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

const fetchTimestamp = async () => {
    try {
        const timestampApiUrl = `${import.meta.env.VITE_API_URL}/timestamp`; // Przykładowy endpoint
        const res = await fetch(timestampApiUrl);
        if (!res.ok) {
            throw new Error(`HTTP error fetching timestamp: ${res.status}`);
        }
        const data = await res.json();
        return data.timestamp as number; // Zakładamy, że backend zwraca obiekt { timestamp: number }
    } catch (error) {
        console.error('❌ Błąd podczas pobierania timestampu:', error);
        return null;
    }
};

const fetchData = async () => {
    setLoading(true);
    try {
        const newTimestamp = await fetchTimestamp();
        if (newTimestamp === null) {
            return; // Przerwij, jeśli nie udało się pobrać timestampu
        }

        if (newTimestamp !== lastUpdatedTimestamp) {
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
            setLastUpdatedTimestamp(newTimestamp); // Zaktualizuj timestamp po udanym pobraniu danych
        } else {
            console.log('Dane nie zostały zmienione, pomijam odświeżanie.');
        }
    } catch (err) {
        console.error('❌ Błąd podczas pobierania danych:', err);
    } finally {
        setLoading(false);
    }
};

    // Efekt uruchamiający autoodświeżanie
    useEffect(() => {
        if (autoRefresh) {
            fetchData();
            const intervalId = setInterval(fetchData, 10000); // Odświeżanie co 60 sekund
            return () => clearInterval(intervalId); // Czyszczenie interwału
        }
    }, [autoRefresh, lastUpdatedTimestamp]); // Zależność od stanu autoRefresh

    // Dodanie efektu, który pobiera dane tylko raz przy pierwszym renderowaniu
    useEffect(() => {
        fetchData();
    }, []);

    if (loading) return <p>⏳ Ładowanie danych z Notion...</p>;
    if (!charts || charts.length === 0) return <p>⚠️ Brak danych do wyświetlenia.</p>;

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <button
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    onClick={fetchData}
                >
                    🔄 Odśwież dane
                </button>
                <label className="flex items-center">
                    <input
                        type="checkbox"
                        className="mr-2"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    Autoodświeżanie
                </label>
            </div>

            {lastUpdated && (
                <p className="text-sm text-gray-500 mb-4">
                    Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}
                </p>
            )}

            <div className="chart-grid">
                {charts.map((chart, index) => {
                    const total = chart.data.reduce((sum, d) => sum + (d?.value ?? 0), 0);

                    return (
                        <div key={index} className="chart-container">
                            <h3 className="chart-title">{chart.title}</h3>
                            <Doughnut
                                data={{
                                    labels: chart.data.map(d => d.label),
                                    datasets: [
                                        {
                                            data: chart.data.map(d => d.value),
                                            backgroundColor: ['#94999dff', '#36a2eb', '#ff4069', '#277f53'],
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
                                                    const value = chart.data.find(item => item.label === label)?.value || 0;
                                                    const percentage = ((value / total) * 100).toFixed(0);
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

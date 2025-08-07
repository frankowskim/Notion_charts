import { useEffect, useRef, useState } from 'react';
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

interface ChartItem {
    title: string;
    slot: number | null;
    data: {
        label: string;
        value: number;
    }[];
}

interface ChangesMap {
    [chartTitle: string]: {
        [label: string]: number;
    }
}

export default function NotionChart() {
    const [charts, setCharts] = useState<ChartItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
    const ws = useRef<WebSocket | null>(null);

    // Aktualizuj tylko zmienione wykresy, na podstawie mapy zmian
    const updateChartsByChanges = (changes: ChangesMap) => {
        setCharts(prevCharts => {
            const updatedCharts = prevCharts.map(chart => {
                if (changes[chart.title]) {
                    // Mapuj dane wykresu aktualizując wartości wg zmian
                    const newData = chart.data.map(d => {
                        if (changes[chart.title][d.label] !== undefined) {
                            return { label: d.label, value: changes[chart.title][d.label] };
                        }
                        return d;
                    });
                    return { ...chart, data: newData };
                }
                return chart;
            });
            return updatedCharts;
        });
        setLastUpdated(new Date());
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const apiUrl = import.meta.env.VITE_API_URL;
            if (!apiUrl) throw new Error('API URL not set');

            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const json = await res.json();
            const data: ChartItem[] = json.charts || [];
            const changes: ChangesMap = json.changes || {};

            setCharts(data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('❌ Błąd podczas pobierania danych:', err);
        } finally {
            setLoading(false);
        }
    };

    // Inicjalizacja WebSocket
    useEffect(() => {
        if (!autoRefresh) return;

        const wsUrl = import.meta.env.VITE_WS_URL;
        if (!wsUrl) {
            console.error("❌ Brak WebSocket URL w środowisku");
            return;
        }

        const socket = new WebSocket(wsUrl);
        ws.current = socket;

        socket.onopen = () => {
            console.log('✅ Połączono z WebSocketem');
        };

        socket.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'update') {
                console.log('🔁 Otrzymano powiadomienie o zmianach z WebSocket — pobieram dane...');
                try {
                    const apiUrl = import.meta.env.VITE_API_URL;
                    if (!apiUrl) throw new Error('API URL not set');

                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

                    const json = await res.json();
                    const changes: ChangesMap = json.changes || {};

                    // Aktualizuj tylko wykresy które się zmieniły
                    updateChartsByChanges(changes);
                } catch (err) {
                    console.error('❌ Błąd podczas pobierania danych przez WebSocket:', err);
                }
            }
        };

        socket.onerror = (error) => {
            console.error('❌ Błąd WebSocket:', error);
        };

        socket.onclose = () => {
            console.warn('⚠️ Połączenie z WebSocket zamknięte');
        };

        return () => {
            socket.close();
        };
    }, [autoRefresh]);

    // Pobierz dane przy pierwszym załadowaniu komponentu
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
                    Autoodświeżanie (WebSocket)
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
                                        datalabels: { display: false },
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

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
    const [selectedBase, setSelectedBase] = useState<string>('all');
    const ws = useRef<WebSocket | null>(null);

    const updateChartsByChanges = (changes: ChangesMap) => {
        setCharts(prevCharts => {
            const updatedCharts = prevCharts.map(chart => {
                if (changes[chart.title]) {
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
            setCharts(data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('❌ Błąd podczas pobierania danych:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
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
                console.log('🔁 Zmiana danych — odświeżam wykresy...');
                try {
                    const apiUrl = import.meta.env.VITE_API_URL;
                    if (!apiUrl) throw new Error('API URL not set');

                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

                    const json = await res.json();
                    const changes: ChangesMap = json.changes || {};
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
    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) return <p>⏳ Ładowanie danych z Notion...</p>;
    if (!charts || charts.length === 0) return <p>⚠️ Brak danych do wyświetlenia.</p>;

    // Lista baz — zakładam format "Baza::Nazwa wykresu"
    const baseList = Array.from(new Set(charts.map(chart => chart.title.split('::')[0])));

    // Filtrowanie
    const displayedCharts = selectedBase === 'all'
        ? charts
        : charts.filter(chart => chart.title.split('::')[0] === selectedBase);

    return (
        <div>
            {/* Dropdown wyboru bazy */}
            <div className="flex items-center mb-4">
                <label className="mr-2">Wybierz bazę:</label>
                <select
                    value={selectedBase}
                    onChange={(e) => setSelectedBase(e.target.value)}
                    className="border rounded px-2 py-1"
                >
                    <option value="all">Wszystkie</option>
                    {baseList.map(base => (
                        <option key={base} value={base}>{base}</option>
                    ))}
                </select>
            </div>

            {lastUpdated && (
                <p className="text-sm text-gray-500 mb-4">
                    Ostatnia aktualizacja: {lastUpdated.toLocaleTimeString()}
                </p>
            )}

            <div className="chart-grid">
                {displayedCharts.map((chart, index) => {
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

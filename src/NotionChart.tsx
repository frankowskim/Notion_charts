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

interface ChartDataPoint {
    label: string;
    value: number;
}

interface ChartItem {
    title: string; // format: "NazwaBazy::NazwaWykresu"
    slot: number | null;
    data: ChartDataPoint[];
}

interface ApiResponse {
    charts: ChartItem[];
}

interface ChangesMap {
    [chartTitle: string]: {
        [label: string]: number;
    };
}

export default function NotionChart() {
    const [charts, setCharts] = useState<ChartItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedBases, setSelectedBases] = useState<string[]>(['all']);
    const ws = useRef<WebSocket | null>(null);

    const updateChartsByChanges = (changes: ChangesMap): void => {
        setCharts(prevCharts =>
            prevCharts.map(chart => {
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
            })
        );
        setLastUpdated(new Date());
    };

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

        socket.onmessage = async (event: MessageEvent) => {
            const message = JSON.parse(event.data);
            if (message.type === 'update') {
                console.log('🔁 Zmiana danych — odświeżam wykresy...');
                try {
                    const apiUrl = import.meta.env.VITE_API_URL;
                    if (!apiUrl) throw new Error('API URL not set');

                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

                    const json: ApiResponse = await res.json();
                    setCharts(json.charts || []);
                    setLastUpdated(new Date());
                } catch (err) {
                    console.error('❌ Błąd podczas pobierania danych przez WebSocket:', err);
                }
            }
        };

        socket.onerror = (error: Event) => {
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

    // Lista baz
    const baseList: string[] = Array.from(new Set(charts.map(chart => chart.title.split('::')[0])));

    // Obsługa zmiany wyboru w dropdown
    const handleBaseChange = (e: ChangeEvent<HTMLSelectElement>): void => {
        const options = e.target.options;
        const selected: string[] = [];
        for (let i = 0; i < options.length; i++) {
            if (options[i].selected) selected.push(options[i].value);
        }
        if (selected.includes('all')) {
            setSelectedBases(['all']);
        } else {
            setSelectedBases(selected);
        }
    };

    // Filtrowanie
    const filteredCharts: ChartItem[] =
        selectedBases.includes('all')
            ? charts
            : charts.filter(chart => selectedBases.includes(chart.title.split('::')[0]));

    // Grupowanie według bazy i sortowanie po polu slot
    const groupedCharts: Record<string, ChartItem[]> = {};
    filteredCharts.forEach(chart => {
        const baseName = chart.title.split('::')[0];
        if (!groupedCharts[baseName]) groupedCharts[baseName] = [];
        groupedCharts[baseName].push(chart);
    });

    // Sortowanie po slot w każdej bazie
    Object.keys(groupedCharts).forEach(baseName => {
        groupedCharts[baseName].sort((a, b) => {
            const slotA = a.slot ?? 0;
            const slotB = b.slot ?? 0;
            return slotA - slotB;
        });
    });

    return (
        <div>
            {/* Dropdown wyboru bazy */}
            <div className="flex items-center mb-4">
                <label className="mr-2">Wybierz bazy:</label>
                <select
                    multiple
                    value={selectedBases}
                    onChange={handleBaseChange}
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

            {/* Grupowanie według baz */}
            {Object.entries(groupedCharts).map(([baseName, baseCharts]) => (
                <div key={baseName} className="mb-8">
                    <h2 className="text-lg font-bold mb-4">{baseName}</h2>
                    <div className="chart-grid">
                        {baseCharts.map((chart, index) => {
                            const total = chart.data.reduce((sum, d) => sum + (d?.value ?? 0), 0);

                            return (
                                <div key={index} className="chart-container">
                                    <h3 className="chart-title">{chart.title.split('::')[1]}</h3>
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
                                                            const percentage = total > 0 ? ((value / total) * 100).toFixed(0) : '0';
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

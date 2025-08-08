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
                fetchData();
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

    // Filtrowanie baz
    const filteredCharts: ChartItem[] =
        selectedBases.includes('all')
            ? charts
            : charts.filter(chart => selectedBases.includes(chart.title.split('::')[0]));

    // Grupowanie po bazie i slocie rodzica + przypisywanie subtasków
    const groupedByBaseAndSlot: Record<string, { [slot: number]: { parent: ChartItem; subtasks: ChartItem[] } }> = {};

    // Najpierw dodajemy rodziców
    filteredCharts.forEach(chart => {
        const baseName = chart.title.split('::')[0];
        if (!groupedByBaseAndSlot[baseName]) groupedByBaseAndSlot[baseName] = {};

        if (chart.slot !== null) {
            groupedByBaseAndSlot[baseName][chart.slot] = { parent: chart, subtasks: [] };
        }
    });

    // Dodajemy subtaski (slot === null) do najbliższego poprzedniego rodzica tej samej bazy
    filteredCharts.forEach((chart, index) => {
        if (chart.slot === null) {
            const baseName = chart.title.split('::')[0];
            for (let i = index - 1; i >= 0; i--) {
                const prev = filteredCharts[i];
                if (prev.slot !== null && prev.title.split('::')[0] === baseName) {
                    groupedByBaseAndSlot[baseName][prev.slot].subtasks.push(chart);
                    break;
                }
            }
        }
    });

    // Sortowanie slotów w każdej bazie
    Object.keys(groupedByBaseAndSlot).forEach(baseName => {
        const sorted = Object.entries(groupedByBaseAndSlot[baseName])
            .sort(([slotA], [slotB]) => Number(slotA) - Number(slotB));
        groupedByBaseAndSlot[baseName] = Object.fromEntries(sorted);
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

            {/* Grupowanie i renderowanie wykresów */}
            {Object.entries(groupedByBaseAndSlot).map(([baseName, slots]) => (
                <div key={baseName} className="mb-8">
                    <h2 className="text-lg font-bold mb-4">{baseName}</h2>
                    <div className="chart-grid">
                        {Object.values(slots).map(({ parent, subtasks }) => {
                            // Łączenie danych rodzica i subtasków
                            const combinedData: ChartDataPoint[] = [];

                            parent.data.forEach(d => combinedData.push({ ...d }));

                            subtasks.forEach(sub => {
                                sub.data.forEach(sd => {
                                    const existing = combinedData.find(c => c.label === sd.label);
                                    if (existing) {
                                        existing.value += sd.value;
                                    } else {
                                        combinedData.push({ ...sd });
                                    }
                                });
                            });

                            const total = combinedData.reduce((sum, d) => sum + (d?.value ?? 0), 0);

                            return (
                                <div key={parent.slot} className="chart-container">
                                    <h3 className="chart-title">{parent.title.split('::')[1]}</h3>
                                    <Doughnut
                                        data={{
                                            labels: combinedData.map(d => d.label),
                                            datasets: [
                                                {
                                                    data: combinedData.map(d => d.value),
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
                                                            const value = combinedData.find(item => item.label === label)?.value || 0;
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

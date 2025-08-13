import React, { useState, useEffect } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Doughnut } from "react-chartjs-2";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./NotionChart.css";

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

interface ChartData {
  labels: string[];
  datasets: { data: number[]; backgroundColor: string[] }[];
}

interface Base {
  id: string;
  name: string;
  chartData: ChartData;
  total: number;
}

interface SortableBaseProps {
  id: string;
  children: React.ReactNode;
}

function SortableBase({ id, children }: SortableBaseProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-base${isDragging ? " dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export default function NotionChart() {
  const [bases, setBases] = useState<Base[]>([]);
  const [selectedBases, setSelectedBases] = useState<string[]>([]);

  useEffect(() => {
    setBases([
      {
        id: "1",
        name: "Baza 1",
        chartData: {
          labels: ["A", "B", "C"],
          datasets: [
            {
              data: [12, 19, 3],
              backgroundColor: ["#ff6384", "#36a2eb", "#cc65fe"],
            },
          ],
        },
        total: 34,
      },
      {
        id: "2",
        name: "Baza 2",
        chartData: {
          labels: ["X", "Y", "Z"],
          datasets: [
            {
              data: [5, 10, 15],
              backgroundColor: ["#ff9f40", "#4bc0c0", "#9966ff"],
            },
          ],
        },
        total: 30,
      },
    ]);
  }, []);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setBases((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleBaseSelection = (id: string) => {
    setSelectedBases((prev) =>
      prev.includes(id) ? prev.filter((baseId) => baseId !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <div className="chart-grid">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={bases.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {bases.map((base) => (
              <SortableBase key={base.id} id={base.id}>
                <div className="chart-container">
                  <h3 className="chart-title">{base.name}</h3>
                  <Doughnut
                    data={base.chartData}
                    options={{
                      cutout: "70%",
                      plugins: {
                        legend: { display: false, position: "bottom" },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.raw}`,
                          },
                        },
                        datalabels: { display: false },
                      },
                    }}
                  />
                  <div className="chart-center">
                    <span className="chart-total">{base.total}</span>
                    <span className="chart-total-label">Total</span>
                  </div>
                </div>
              </SortableBase>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./NotionChart.css";

type Base = {
  id: string;
  name: string;
  visible: boolean;
};

const SortableBase = ({ id, children }: { id: string; children: React.ReactNode }) => {
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
      className={`sortable-base ${isDragging ? "dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

export default function NotionChart() {
  const [bases, setBases] = useState<Base[]>([
    { id: "1", name: "Baza A", visible: true },
    { id: "2", name: "Baza B", visible: true },
    { id: "3", name: "Baza C", visible: false },
  ]);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setBases((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleBaseVisibility = (id: string) => {
    setBases((prev) =>
      prev.map((base) =>
        base.id === id ? { ...base, visible: !base.visible } : base
      )
    );
  };

  return (
    <div>
      {/* Dropdown menu wyboru bazy */}
      <div className="base-selector">
        <button onClick={() => setIsDropdownOpen((prev) => !prev)}>
          Wybierz bazy
        </button>
        {isDropdownOpen && (
          <div className="dropdown">
            {bases.map((base) => (
              <div
                key={base.id}
                className="option"
                onClick={() => toggleBaseVisibility(base.id)}
              >
                <input type="checkbox" checked={base.visible} readOnly />
                {base.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drag & Drop lista baz */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={bases.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {bases
            .filter((b) => b.visible)
            .map((base) => (
              <SortableBase key={base.id} id={base.id}>
                <h3 className="chart-title">{base.name}</h3>
                <div className="chart-center">
                  <span className="chart-total">123</span>
                  <span className="chart-total-label">Total</span>
                </div>
              </SortableBase>
            ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

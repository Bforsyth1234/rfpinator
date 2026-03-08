"use client";

import { useState } from "react";
import { clsx } from "clsx";

export type View = "upload" | "results" | "documents" | "evaluation";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  providers: string[];
}

const NAV_ITEMS: { key: View; label: string; icon: string }[] = [
  { key: "upload", label: "Upload", icon: "📄" },
  { key: "results", label: "Results", icon: "📊" },
  { key: "documents", label: "Documents", icon: "📁" },
  { key: "evaluation", label: "Evaluation", icon: "🧪" },
];

export function Sidebar({
  currentView,
  onNavigate,
  selectedModel,
  onModelChange,
  providers,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        "flex h-screen flex-col border-r border-surface-border bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand + collapse toggle */}
      <div className="flex items-center border-b border-surface-border px-3 py-4">
        {!collapsed && (
          <span className="flex-1 pl-2 text-xl font-bold text-brand-700">RFPinator</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              collapsed ? "justify-center" : "gap-3",
              currentView === item.key
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            <span>{item.icon}</span>
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {/* Settings / Model Selector */}
      {!collapsed ? (
        <div className="border-t border-surface-border px-4 py-4">
          <label htmlFor="model-select" className="label mb-1.5">
            Answering Model
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="input"
          >
            {providers.length === 0 && (
              <option value="groq">groq (default)</option>
            )}
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="border-t border-surface-border px-2 py-4">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Answering Model"
            className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            ⚙️
          </button>
        </div>
      )}
    </aside>
  );
}


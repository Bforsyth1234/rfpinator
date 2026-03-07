"use client";

import { clsx } from "clsx";

export type View = "upload" | "results";

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
];

export function Sidebar({
  currentView,
  onNavigate,
  selectedModel,
  onModelChange,
  providers,
}: SidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-surface-border bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-surface-border px-5 py-4">
        <span className="text-xl font-bold text-brand-700">RFPinator</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={clsx(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              currentView === item.key
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Settings / Model Selector */}
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
    </aside>
  );
}


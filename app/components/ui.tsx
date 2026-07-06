"use client";

import { Languages } from "lucide-react";
import type { Language } from "../../lib/types";

export function Shell({ children, language, onLanguage, right }: { children: React.ReactNode; language: Language; onLanguage: () => void; right?: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/preferred-maintenance-logo.png" alt="Preferred Maintenance logo" />
          <div>
            <h1>Special Project Hours</h1>
            <span>Preferred Maintenance</span>
          </div>
        </div>
        <div className="segmented">
          <button className="icon-button" onClick={onLanguage} aria-label="Change language" title={`Language: ${language.toUpperCase()}`}>
            <Languages size={18} />
          </button>
          {right}
        </div>
      </header>
      {children}
    </div>
  );
}

export function HeaderLine({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="row">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <div className="muted small">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ReportList({ title, rows }: { title: string; rows: { label: string; value: string | number }[] }) {
  return (
    <div className="card list">
      <strong>{title}</strong>
      {rows.map((row) => (
        <div className="row" key={`${title}-${row.label}`}>
          <span>{row.label}</span>
          <span className="badge">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

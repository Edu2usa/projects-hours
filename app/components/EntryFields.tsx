"use client";

import { Check, Search } from "lucide-react";
import { roundApprovedHours } from "../../lib/hours";
import { copy } from "../../lib/i18n";
import type { Account, Language, Service } from "../../lib/types";
import type { Draft } from "./drafts";

export function AccountFields({ accounts, draft, update, language }: { accounts: Account[]; draft: Draft; update: (partial: Partial<Draft>) => void; language: Language }) {
  const t = copy[language];
  const activeAccounts = accounts
    .filter((account) => account.active)
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
  return (
    <div className="grid">
      <div className="field">
        <label>{t.account}</label>
        <select className="select" value={draft.accountId} onChange={(event) => update({ accountId: event.target.value })}>
          <option value="">{t.chooseAccount}</option>
          {activeAccounts.filter((account) => account.isFavorite).map((account) => <option key={account.id} value={account.id}>Favorite - {account.canonicalName}</option>)}
          {activeAccounts.filter((account) => !account.isFavorite).map((account) => <option key={account.id} value={account.id}>{account.canonicalName}</option>)}
          <option value="other">{t.otherCleanup}</option>
        </select>
      </div>
      {draft.accountId === "other" && (
        <div className="field">
          <label>{t.otherAccount}</label>
          <input className="input" value={draft.rawAccountText} onChange={(event) => update({ rawAccountText: event.target.value })} />
        </div>
      )}
    </div>
  );
}

export function TimeFields({ draft, update, calculated, language }: { draft: Draft; update: (partial: Partial<Draft>) => void; calculated: number; language: Language }) {
  const t = copy[language];
  return (
    <div className="grid two">
      <div className="field">
        <label>{t.workDate}</label>
        <input className="input" type="date" value={draft.workDate} onChange={(event) => update({ workDate: event.target.value })} />
      </div>
      <div className="field">
        <label>{t.hours}</label>
        <input className="input" aria-label={t.hours} value={draft.startTime && draft.finishTime ? `${draft.overrideHours ? roundApprovedHours(Number(draft.overrideHours)) : calculated} ${t.hoursLower}` : ""} placeholder={`0 ${t.hoursLower}`} readOnly />
      </div>
      <div className="field">
        <label>{t.start}</label>
        <input className="input" type="time" value={draft.startTime} onChange={(event) => update({ startTime: event.target.value })} />
      </div>
      <div className="field">
        <label>{t.finish}</label>
        <input className="input" type="time" value={draft.finishTime} onChange={(event) => update({ finishTime: event.target.value })} />
      </div>
      <div className="field">
        <label>{t.override}</label>
        <input
          className="input"
          inputMode="decimal"
          value={draft.overrideHours}
          onChange={(event) => update({ overrideHours: event.target.value })}
          onBlur={(event) => {
            const rounded = roundApprovedHours(Number(event.target.value));
            if (Number.isFinite(rounded) && rounded > 0) update({ overrideHours: String(rounded) });
          }}
          placeholder={t.optional}
          aria-label={t.override}
        />
      </div>
      <div className="field">
        <label>{t.reason}</label>
        <input className="input" value={draft.overrideReason} onChange={(event) => update({ overrideReason: event.target.value })} disabled={!draft.overrideHours} aria-label={t.reason} />
      </div>
    </div>
  );
}

export function ServiceFields({ services, draft, update, language }: { services: Service[]; draft: Draft; update: (partial: Partial<Draft>) => void; language: Language }) {
  const t = copy[language];
  function toggleService(id: string) {
    update({ serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((item) => item !== id) : [...draft.serviceIds, id] });
  }
  return (
    <div className="grid">
      <label className="muted small">{t.service}</label>
      <div className="segmented">
        {services.filter((service) => service.active).map((service) => (
          <button key={service.id} className={`chip ${draft.serviceIds.includes(service.id) ? "active" : ""}`} aria-pressed={draft.serviceIds.includes(service.id)} onClick={() => toggleService(service.id)}>
            {draft.serviceIds.includes(service.id) ? <Check size={16} /> : <Search size={16} />} {service.label[language]}
          </button>
        ))}
      </div>
      <div className="field">
        <label>{t.otherService}</label>
        <input className="input" value={draft.rawServiceText} onChange={(event) => update({ rawServiceText: event.target.value })} placeholder={t.optional} aria-label={t.otherService} />
      </div>
    </div>
  );
}

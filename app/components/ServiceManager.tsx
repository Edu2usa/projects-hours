"use client";

import { useState } from "react";
import type { JobEntry, Service } from "../../lib/types";
import { normalizeName, uniqueSlugId } from "./helpers";

export function ServiceManager({ services, setServices, entries }: { services: Service[]; setServices: (services: Service[]) => void; entries: JobEntry[] }) {
  const [newEnglish, setNewEnglish] = useState("");
  const [newSpanish, setNewSpanish] = useState("");
  const [newPortuguese, setNewPortuguese] = useState("");
  const [newCommon, setNewCommon] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEnglish, setEditEnglish] = useState("");
  const [editSpanish, setEditSpanish] = useState("");
  const [editPortuguese, setEditPortuguese] = useState("");
  const [editCommon, setEditCommon] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sortedServices = [...services].sort((left, right) => Number(right.active) - Number(left.active) || left.label.en.localeCompare(right.label.en));

  function nameExists(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    return services.some((service) => service.id !== exceptId && normalizeName(service.label.en) === normalized);
  }

  function addService() {
    const english = newEnglish.trim();
    if (!english) {
      setNotice("Enter the English service name before adding it.");
      return;
    }
    if (nameExists(english)) {
      setNotice("That service already exists.");
      return;
    }
    const id = uniqueSlugId(english, services.map((service) => service.id), "service");
    const nextService: Service = {
      id,
      canonicalKey: id.replace(/-/g, "_"),
      label: {
        en: english,
        es: newSpanish.trim() || english,
        pt: newPortuguese.trim() || english
      },
      active: true,
      isCommon: newCommon
    };
    setServices([...services, nextService]);
    setNewEnglish("");
    setNewSpanish("");
    setNewPortuguese("");
    setNewCommon(false);
    setNotice(`Added ${english}.`);
  }

  function startEdit(service: Service) {
    setEditingId(service.id);
    setEditEnglish(service.label.en);
    setEditSpanish(service.label.es);
    setEditPortuguese(service.label.pt);
    setEditCommon(service.isCommon);
    setNotice(null);
  }

  function saveEdit(serviceId: string) {
    const english = editEnglish.trim();
    if (!english) {
      setNotice("Service name cannot be blank.");
      return;
    }
    if (nameExists(english, serviceId)) {
      setNotice("Another service already uses that name.");
      return;
    }
    setServices(services.map((service) => service.id === serviceId ? {
      ...service,
      label: {
        en: english,
        es: editSpanish.trim() || english,
        pt: editPortuguese.trim() || english
      },
      isCommon: editCommon,
      active: true
    } : service));
    setEditingId(null);
    setNotice(`Updated ${english}.`);
  }

  function deleteService(service: Service) {
    const usedInEntries = entries.some((entry) => entry.serviceIds.includes(service.id));
    if (usedInEntries) {
      setServices(services.map((item) => item.id === service.id ? { ...item, active: false, isCommon: false } : item));
      setNotice(`${service.label.en} was archived because past entries still reference it.`);
      return;
    }
    setServices(services.filter((item) => item.id !== service.id));
    setNotice(`Deleted ${service.label.en}.`);
  }

  return (
    <div className="card list master-data-manager">
      <strong>Services</strong>
      <div className="field">
        <label>New service name</label>
        <input className="input" value={newEnglish} onChange={(event) => setNewEnglish(event.target.value)} placeholder="English" />
      </div>
      <div className="grid two compact-form">
        <input className="input" value={newSpanish} onChange={(event) => setNewSpanish(event.target.value)} placeholder="Spanish label" aria-label="New service Spanish label" />
        <input className="input" value={newPortuguese} onChange={(event) => setNewPortuguese(event.target.value)} placeholder="Portuguese label" aria-label="New service Portuguese label" />
      </div>
      <label className="checkline">
        <input type="checkbox" checked={newCommon} onChange={(event) => setNewCommon(event.target.checked)} />
        Common / show as big button
      </label>
      <button className="primary" onClick={addService}>Add service</button>
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="list compact-list">
        {sortedServices.map((service) => (
          <div className={`row master-data-row ${service.active ? "" : "inactive"}`} key={service.id}>
            {editingId === service.id ? (
              <div className="grid master-data-edit">
                <input className="input" value={editEnglish} onChange={(event) => setEditEnglish(event.target.value)} aria-label={`Edit ${service.label.en}`} />
                <div className="grid two compact-form">
                  <input className="input" value={editSpanish} onChange={(event) => setEditSpanish(event.target.value)} aria-label={`Spanish label for ${service.label.en}`} />
                  <input className="input" value={editPortuguese} onChange={(event) => setEditPortuguese(event.target.value)} aria-label={`Portuguese label for ${service.label.en}`} />
                </div>
                <label className="checkline">
                  <input type="checkbox" checked={editCommon} onChange={(event) => setEditCommon(event.target.checked)} />
                  Common
                </label>
                <div className="segmented master-data-actions">
                  <button className="primary" onClick={() => saveEdit(service.id)}>Save</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{service.label.en}</strong>
                  <div className="small muted">{service.active ? (service.isCommon ? "Common" : "Full list") : "Archived"}</div>
                </div>
                <div className="segmented master-data-actions">
                  <button className="secondary" onClick={() => startEdit(service)}>Change</button>
                  <button className="danger" onClick={() => deleteService(service)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

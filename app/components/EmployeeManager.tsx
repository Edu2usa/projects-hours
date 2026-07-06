"use client";

import { useState } from "react";
import type { Employee, JobEntry, Language, Role } from "../../lib/types";
import { normalizeName, uniqueSlugId } from "./helpers";

export function EmployeeManager({ employees, setEmployees, entries }: { employees: Employee[]; setEmployees: (employees: Employee[]) => void; entries: JobEntry[] }) {
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("worker");
  const [newLanguage, setNewLanguage] = useState<Language>("en");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("worker");
  const [editLanguage, setEditLanguage] = useState<Language>("en");
  const [notice, setNotice] = useState<string | null>(null);
  const sortedEmployees = [...employees].sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));

  function nameExists(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    return employees.some((employee) => employee.id !== exceptId && normalizeName(employee.name) === normalized);
  }

  function addEmployee() {
    const name = newName.trim();
    if (!name) {
      setNotice("Enter an employee name before adding it.");
      return;
    }
    if (nameExists(name)) {
      setNotice("That employee already exists.");
      return;
    }
    const nextEmployee: Employee = {
      id: uniqueSlugId(name, employees.map((employee) => employee.id), "employee"),
      name,
      role: newRole,
      active: true,
      preferredLanguage: newLanguage
    };
    setEmployees([...employees, nextEmployee]);
    setNewName("");
    setNewRole("worker");
    setNewLanguage("en");
    setNotice(`Added ${name}.`);
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setEditName(employee.name);
    setEditRole(employee.role);
    setEditLanguage(employee.preferredLanguage ?? "en");
    setNotice(null);
  }

  function saveEdit(employeeId: string) {
    const name = editName.trim();
    if (!name) {
      setNotice("Employee name cannot be blank.");
      return;
    }
    if (nameExists(name, employeeId)) {
      setNotice("Another employee already uses that name.");
      return;
    }
    setEmployees(employees.map((employee) => employee.id === employeeId ? { ...employee, name, role: editRole, preferredLanguage: editLanguage, active: true } : employee));
    setEditingId(null);
    setNotice(`Updated ${name}.`);
  }

  function deleteEmployee(employee: Employee) {
    const activeAdminCount = employees.filter((item) => item.active && item.role === "admin").length;
    if (employee.role === "admin" && activeAdminCount <= 1) {
      setNotice("Keep at least one active admin.");
      return;
    }
    const usedInEntries = entries.some((entry) => entry.submittedByEmployeeId === employee.id || entry.workerLines.some((line) => line.employeeId === employee.id));
    if (usedInEntries) {
      setEmployees(employees.map((item) => item.id === employee.id ? { ...item, active: false } : item));
      setNotice(`${employee.name} was archived because past entries still reference them.`);
      return;
    }
    setEmployees(employees.filter((item) => item.id !== employee.id));
    setNotice(`Deleted ${employee.name}.`);
  }

  return (
    <div className="card list master-data-manager">
      <strong>Employees</strong>
      <div className="field">
        <label>New employee name</label>
        <input className="input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Jonathan" />
      </div>
      <div className="grid two compact-form">
        <select className="select" value={newRole} onChange={(event) => setNewRole(event.target.value as Role)} aria-label="New employee role">
          <option value="worker">Worker</option>
          <option value="crew_lead">Crew lead</option>
          <option value="admin">Admin</option>
        </select>
        <select className="select" value={newLanguage} onChange={(event) => setNewLanguage(event.target.value as Language)} aria-label="New employee language">
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="pt">Portuguese</option>
        </select>
      </div>
      <button className="primary" onClick={addEmployee}>Add employee</button>
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="list compact-list">
        {sortedEmployees.map((employee) => (
          <div className={`row master-data-row ${employee.active ? "" : "inactive"}`} key={employee.id}>
            {editingId === employee.id ? (
              <div className="grid master-data-edit">
                <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} aria-label={`Edit ${employee.name}`} />
                <div className="grid two compact-form">
                  <select className="select" value={editRole} onChange={(event) => setEditRole(event.target.value as Role)} aria-label={`Role for ${employee.name}`}>
                    <option value="worker">Worker</option>
                    <option value="crew_lead">Crew lead</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select className="select" value={editLanguage} onChange={(event) => setEditLanguage(event.target.value as Language)} aria-label={`Language for ${employee.name}`}>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="pt">Portuguese</option>
                  </select>
                </div>
                <div className="segmented master-data-actions">
                  <button className="primary" onClick={() => saveEdit(employee.id)}>Save</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{employee.name}</strong>
                  <div className="small muted">{employee.active ? `${employee.role} / ${(employee.preferredLanguage ?? "en").toUpperCase()}` : "Archived"}</div>
                </div>
                <div className="segmented master-data-actions">
                  <button className="secondary" onClick={() => startEdit(employee)}>Change</button>
                  <button className="danger" onClick={() => deleteEmployee(employee)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

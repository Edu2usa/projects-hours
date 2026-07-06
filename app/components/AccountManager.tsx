"use client";

import { useState } from "react";
import type { Account, JobEntry } from "../../lib/types";
import { normalizeName, uniqueAccountId } from "./helpers";

export function AccountManager({ accounts, setAccounts, entries }: { accounts: Account[]; setAccounts: (accounts: Account[]) => void; entries: JobEntry[] }) {
  const [newName, setNewName] = useState("");
  const [newFavorite, setNewFavorite] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFavorite, setEditFavorite] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sortedAccounts = [...accounts].sort((left, right) => Number(right.active) - Number(left.active) || left.canonicalName.localeCompare(right.canonicalName));

  function nameExists(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    return accounts.some((account) => account.id !== exceptId && normalizeName(account.canonicalName) === normalized);
  }

  function addAccount() {
    const canonicalName = newName.trim();
    if (!canonicalName) {
      setNotice("Enter a customer name before adding it.");
      return;
    }
    if (nameExists(canonicalName)) {
      setNotice("That customer name already exists.");
      return;
    }
    const nextAccount: Account = {
      id: uniqueAccountId(canonicalName, accounts),
      canonicalName,
      active: true,
      isFavorite: newFavorite
    };
    setAccounts([...accounts, nextAccount]);
    setNewName("");
    setNewFavorite(false);
    setNotice(`Added ${canonicalName}.`);
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setEditName(account.canonicalName);
    setEditFavorite(account.isFavorite);
    setNotice(null);
  }

  function saveEdit(accountId: string) {
    const canonicalName = editName.trim();
    if (!canonicalName) {
      setNotice("Customer name cannot be blank.");
      return;
    }
    if (nameExists(canonicalName, accountId)) {
      setNotice("Another customer already uses that name.");
      return;
    }
    setAccounts(accounts.map((account) => account.id === accountId ? { ...account, canonicalName, isFavorite: editFavorite, active: true } : account));
    setEditingId(null);
    setEditName("");
    setNotice(`Updated ${canonicalName}.`);
  }

  function deleteAccount(account: Account) {
    const usedInEntries = entries.some((entry) => entry.accountId === account.id);
    if (usedInEntries) {
      setAccounts(accounts.map((item) => item.id === account.id ? { ...item, active: false, isFavorite: false } : item));
      setNotice(`${account.canonicalName} was archived because past entries still reference it.`);
      return;
    }
    setAccounts(accounts.filter((item) => item.id !== account.id));
    setNotice(`Deleted ${account.canonicalName}.`);
  }

  return (
    <div className="card list master-data-manager">
      <strong>Customer accounts</strong>
      <div className="field">
        <label>New customer/account name</label>
        <input className="input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Belimo" />
      </div>
      <label className="checkline">
        <input type="checkbox" checked={newFavorite} onChange={(event) => setNewFavorite(event.target.checked)} />
        Favorite / show first
      </label>
      <button className="primary" onClick={addAccount}>Add customer</button>
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="list compact-list">
        {sortedAccounts.map((account) => (
          <div className={`row master-data-row ${account.active ? "" : "inactive"}`} key={account.id}>
            {editingId === account.id ? (
              <div className="grid master-data-edit">
                <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} aria-label={`Edit ${account.canonicalName}`} />
                <label className="checkline">
                  <input type="checkbox" checked={editFavorite} onChange={(event) => setEditFavorite(event.target.checked)} />
                  Favorite
                </label>
                <div className="segmented master-data-actions">
                  <button className="primary" onClick={() => saveEdit(account.id)}>Save</button>
                  <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{account.canonicalName}</strong>
                  <div className="small muted">{account.active ? (account.isFavorite ? "Favorite" : "Active") : "Archived"}</div>
                </div>
                <div className="segmented master-data-actions">
                  <button className="secondary" onClick={() => startEdit(account)}>Change</button>
                  <button className="danger" onClick={() => deleteAccount(account)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

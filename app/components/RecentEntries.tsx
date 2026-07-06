"use client";

import { copy } from "../../lib/i18n";
import type { Account, JobEntry, Language } from "../../lib/types";
import { accountLabel } from "./helpers";
import { HeaderLine } from "./ui";

export function RecentEntries({ entries, accounts, language, employeeId }: { entries: JobEntry[]; accounts: Account[]; language: Language; employeeId: string }) {
  return (
    <section className="panel grid">
      <HeaderLine title={copy[language].recent} subtitle={copy[language].recentSubtitle} />
      <div className="list">
        {entries.map((entry) => {
          const line = entry.workerLines.find((item) => item.employeeId === employeeId);
          return (
            <div className="row" key={entry.id}>
              <div>
                <strong>{accountLabel(accounts, entry.accountId, entry.rawAccountText)}</strong>
                <div className="small muted">{entry.workDate} / {line?.approvedHours ?? entry.defaultCalculatedHours} {copy[language].hoursLower}</div>
              </div>
              <span className={`badge ${entry.flags.length ? "warn" : ""}`}>{entry.flags.length ? copy[language].needsReview : copy[language].approved}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

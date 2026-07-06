"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { copy } from "../../lib/i18n";
import type { Language, Session } from "../../lib/types";

export function Login({ language, onLogin }: { language: Language; onLogin: (session: Session) => void }) {
  const t = copy[language];
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFeedback(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, pin })
      });
      const payload = await response.json() as { ok?: boolean; session?: Session; error?: string };
      if (!response.ok || !payload.ok || !payload.session) {
        setFeedback(payload.error ?? t.invalidLogin);
        return;
      }
      onLogin(payload.session);
    } catch {
      setFeedback(t.loginError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="main login">
      <section className="panel grid">
        <div>
          <h2 className="section-title">{t.loginTitle}</h2>
          <p className="muted">{t.loginSubtitle}</p>
        </div>
        <div className="field">
          <label>{t.user}</label>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>{t.pin}</label>
          <input className="input" value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" maxLength={4} type="password" autoComplete="current-password" />
        </div>
        {feedback && (
          <div className="feedback-banner error" role="status">
            <AlertTriangle size={18} />
            <span>{feedback}</span>
          </div>
        )}
        <button className="primary" onClick={submit} disabled={submitting}>{submitting ? t.signingIn : t.signIn}</button>
      </section>
    </main>
  );
}

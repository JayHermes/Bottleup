import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { ShieldCheck, WalletCards } from "./Icons.jsx";

export default function BankAccount({ userId, preview = false }) {
  const [saved, setSaved] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState({
    bank_name: "",
    account_holder: "",
    account_number: "",
  });
  async function load() {
    if (preview || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("bank_name,account_holder,account_number")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      setSaved(data);
      setMessage("");
    } catch {
      setFailed(true);
      setMessage(
        "Bank details could not be loaded. Please retry once the database is connected and set up.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [userId, preview]);
  async function save(e) {
    e.preventDefault();
    if (!/^\d{10}$/.test(draft.account_number)) {
      setMessage("Enter a 10-digit Nigerian account number.");
      return;
    }
    if (preview || !supabase) {
      setMessage(
        "Preview only. Nothing was saved. Bank details can be saved after the database is connected.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase
        .from("bank_accounts")
        .upsert({
          user_id: userId,
          bank_name: draft.bank_name.trim(),
          account_holder: draft.account_holder.trim(),
          account_number: draft.account_number,
        })
        .select("bank_name,account_holder,account_number")
        .single();
      if (error) throw error;
      setSaved(data);
      setDraft({ bank_name: "", account_holder: "", account_number: "" });
      setEditing(false);
      setMessage("Bank details saved.");
    } catch {
      setMessage("Could not save your bank details. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm("Remove your saved bank details?")) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("bank_accounts")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
      setSaved(null);
      setMessage("Bank details removed.");
    } catch {
      setMessage("Could not remove your bank details. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="dashPanel bankPanel">
      <div className="dashSectionTitle">
        <div>
          <span className="eyebrow">YOUR PAYMENT DETAILS</span>
          <h2>A home for your rewards.</h2>
        </div>
        <WalletCards size={26} />
      </div>
      <p>
        Keep your bank details on your account for future payouts. Cash
        withdrawals are not available yet.
      </p>
      {loading ? (
        <p role="status">Loading bank details…</p>
      ) : failed ? (
        <button className="secondary" onClick={load}>
          Retry loading
        </button>
      ) : saved && !editing ? (
        <div className="savedBank">
          <strong>{saved.bank_name}</strong>
          <span>••••••{saved.account_number.slice(-4)}</span>
          <span>{saved.account_holder}</span>
          <small>Details supplied by you · not bank-verified</small>
          <div className="dashActions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setDraft(saved);
                setEditing(true);
                setMessage("");
              }}
            >
              Edit details
            </button>
            <button className="textButton" disabled={busy} onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form className="dashForm" onSubmit={save}>
          <label>
            Bank name
            <input
              required
              maxLength={100}
              value={draft.bank_name}
              onChange={(e) =>
                setDraft({ ...draft, bank_name: e.target.value })
              }
              placeholder="e.g. Access Bank"
            />
          </label>
          <label>
            Account holder’s name
            <input
              required
              maxLength={120}
              value={draft.account_holder}
              onChange={(e) =>
                setDraft({ ...draft, account_holder: e.target.value })
              }
              placeholder="Name on your bank account"
            />
          </label>
          <label>
            Account number
            <input
              required
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{10}"
              maxLength={10}
              value={draft.account_number}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  account_number: e.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="10-digit account number"
            />
          </label>
          <div className="dashActions">
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save bank details"}
            </button>
            {editing && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setDraft({
                    bank_name: "",
                    account_holder: "",
                    account_number: "",
                  });
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      {message && (
        <p className="dashFeedback" role="status">
          {message}
        </p>
      )}
      <small className="bankPrivacy">
        <ShieldCheck size={16} /> Your details are private to your account.
        Never enter a PIN, BVN or password here.
      </small>
    </section>
  );
}

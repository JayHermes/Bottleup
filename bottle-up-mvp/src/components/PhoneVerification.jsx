import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { ShieldCheck, Smartphone } from "./Icons.jsx";

const RESEND_COOLDOWN_SECONDS = 60;

function maskPhone(phone) {
  if (!phone) return "";
  return `${phone.slice(0, 4)} •••• ${phone.slice(-3)}`;
}

export default function PhoneVerification({ userId, phone, phoneVerified, preview = false, onVerified }) {
  const [step, setStep] = useState("number"); // 'number' | 'code'
  const [phoneDraft, setPhoneDraft] = useState(phone || "");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);
  useEffect(() => {
    setPhoneDraft(phone || "");
  }, [phone]);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function sendCode(e) {
    e?.preventDefault();
    setMessage("");
    if (preview || !supabase) {
      setMessage("Preview only. A verification code can be sent once the database is connected.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-phone-otp", { body: { phone: phoneDraft } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      setSentTo(data.phone || phoneDraft);
      setStep("code");
      setCode("");
      setMessage(`We sent a 6-digit code to ${data.phone || phoneDraft}.`);
      startCooldown();
    } catch (err) {
      setMessage(err.message || "Could not send a verification code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setMessage("");
    if (preview || !supabase) {
      setMessage("Preview only. Nothing was verified.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-phone-otp", { body: { phone: sentTo, code } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      setMessage("Phone number verified.");
      setStep("number");
      await onVerified?.();
    } catch (err) {
      setMessage(err.message || "Could not verify that code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashPanel phonePanel">
      <div className="dashSectionTitle">
        <div>
          <span className="eyebrow">PHONE VERIFICATION</span>
          <h2>Unlock airtime and data rewards.</h2>
        </div>
        <Smartphone size={26} />
      </div>
      <p>
        Verify a phone number to redeem airtime and data bundles — they're sent automatically the moment you
        redeem, straight to this number.
      </p>
      {phoneVerified && step === "number" ? (
        <div className="savedBank">
          <strong>{maskPhone(phone)}</strong>
          <small>
            <ShieldCheck size={14} /> Verified
          </small>
          <div className="dashActions">
            <button className="secondary" disabled={busy} onClick={() => { setStep("number"); setPhoneDraft(""); setMessage(""); }}>
              Use a different number
            </button>
          </div>
        </div>
      ) : step === "number" ? (
        <form className="dashForm" onSubmit={sendCode}>
          <label>
            Phone number
            <input
              required
              inputMode="tel"
              autoComplete="tel"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="e.g. 0803 123 4567"
            />
          </label>
          <div className="dashActions">
            <button className="primary" disabled={busy || !phoneDraft.trim()}>
              {busy ? "Sending…" : "Send verification code"}
            </button>
          </div>
        </form>
      ) : (
        <form className="dashForm" onSubmit={verifyCode}>
          <label>
            6-digit code
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </label>
          <div className="dashActions">
            <button className="primary" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify code"}
            </button>
            <button type="button" className="secondary" disabled={busy || cooldown > 0} onClick={sendCode}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            <button type="button" className="textButton" disabled={busy} onClick={() => { setStep("number"); setMessage(""); }}>
              Use a different number
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="dashFeedback" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

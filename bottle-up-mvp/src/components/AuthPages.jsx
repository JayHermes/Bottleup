import React, { useEffect, useId, useState } from "react";
import { BrandMark } from "./Brand.jsx";
import { Icon } from "./Icons.jsx";
import { supabase } from "../lib/supabase.js";
import "./auth.css";

export function AuthLayout({ children, mode = "signin", onBack, onLegal }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode]);
  const signup = mode === "signup";
  return (
    <div className="bu-auth">
      <aside
        className="bu-auth-story"
        aria-label="Small acts, greener beginnings"
      >
        <button
          className="bu-auth-brand"
          onClick={onBack}
          disabled={!onBack}
          aria-label="BottleUp home"
        >
          <BrandMark />
          <span>
            bottleup<span>.</span>
          </span>
        </button>
        <div className="bu-auth-story-copy">
          <span className="bu-auth-eyebrow">
            SMALL ACTS. GREENER BEGINNINGS.
          </span>
          <h2>
            {signup ? (
              <>
                A little habit.
                <br />A greener tomorrow.
              </>
            ) : (
              <>
                Good to have
                <br />
                you in the loop.
              </>
            )}
          </h2>
          <p>
            Your next good thing starts with
            <br />
            what’s already in your hands.
          </p>
        </div>
        <div className="bu-auth-art">
          <img
            src="/illustrations/auth-recycling.webp"
            width="1086"
            height="1448"
            alt="A woman sorts clean plastic bottles into a green reusable collection bag at home."
            fetchpriority="high"
          />
        </div>
        <div className="bu-auth-story-foot">
          <span>
            <Icon name="leaf-outline" size={17} /> Every bottle has a next
            chapter.
          </span>
          <span>✳</span>
        </div>
      </aside>
      <div className="bu-auth-main">
        <header className="bu-auth-top">
          <button className="bu-auth-back" onClick={onBack} disabled={!onBack}>
            <Icon name="arrow-back" size={17} /> Back to BottleUp
          </button>
          <span>RECYCLE. REWARD. REPEAT.</span>
        </header>
        <main className={`bu-auth-content bu-auth-content-${mode}`}>
          {children}
        </main>
        <footer className="bu-auth-footer">
          <span>Small acts. A little more good.</span>
          {onLegal && (
            <div>
              <button onClick={() => onLegal("privacy")}>Privacy</button>
              <button onClick={() => onLegal("terms")}>Terms</button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

function PasswordInput({
  label = "Password",
  value,
  onChange,
  newPassword = false,
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="bu-auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="bu-auth-password">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={newPassword ? 8 : 1}
          autoComplete={newPassword ? "new-password" : "current-password"}
          value={value}
          onChange={onChange}
          placeholder={
            newPassword ? "At least 8 characters" : "Enter your password"
          }
          disabled={disabled}
        />
        <button
          type="button"
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          disabled={disabled}
        >
          <Icon name={visible ? "eye-off-outline" : "eye-outline"} size={21} />
        </button>
      </div>
    </div>
  );
}

function Message({ children, error }) {
  return children ? (
    <div
      className={`bu-auth-message${error ? " is-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <Icon
        name={error ? "alert-circle-outline" : "checkmark-circle-outline"}
        size={19}
      />
      <span>{children}</span>
    </div>
  ) : null;
}

export function AuthPanel({ mode: initialMode = "signin", onBack, onLegal }) {
  const [mode, setMode] = useState(initialMode);
  const [fields, setFields] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    wantsCollector: false,
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const set = (key, value) =>
    setFields((previous) => ({ ...previous, [key]: value }));
  const changeMode = (next) => {
    setMode(next);
    setMessage("");
    setSent(null);
    set("password", "");
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    if (!supabase) {
      setMessage(
        "Account access is temporarily unavailable. Please try again later.",
      );
      return;
    }
    setBusy(true);
    try {
      const email = fields.email.trim();
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSent("reset");
        return;
      }
      if (mode === "signup" && !fields.fullName.trim()) {
        setMessage("Please enter your name.");
        return;
      }
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({
              email,
              password: fields.password,
              options: {
                data: {
                  full_name: fields.fullName.trim(),
                  phone: fields.phone.trim(),
                  wants_collector: fields.wantsCollector,
                },
              },
            })
          : await supabase.auth.signInWithPassword({
              email,
              password: fields.password,
            });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setSent("signup");
        set("password", "");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const signup = mode === "signup";
  const forgot = mode === "forgot";
  return (
    <AuthLayout mode={mode} onBack={onBack} onLegal={onLegal}>
      {sent ? (
        <div className="bu-auth-sent">
          <div className="bu-auth-emblem">
            <Icon name="mail-open-outline" size={32} />
          </div>
          <span className="bu-auth-eyebrow">ONE SMALL STEP LEFT</span>
          <h1>Check your inbox.</h1>
          <p>
            {sent === "reset"
              ? "If an account exists for this email, a password reset link is on its way to"
              : "We’ve sent an account confirmation link to"}{" "}
            <strong>{fields.email.trim()}</strong>.
          </p>
          {sent === "signup" && fields.wantsCollector && (
            <p className="bu-auth-hint">
              Your collector application will be reviewed separately after
              signup.
            </p>
          )}
          <div className="bu-auth-email-note">
            <Icon name="paper-plane-outline" size={22} />
            <p>
              {sent === "reset"
                ? "Open the link in your email to choose a new password."
                : "Open the link in your email to confirm your account, then come back to sign in."}{" "}
              Can’t see it? Check your spam folder, too.
            </p>
          </div>
          <button
            className="bu-auth-submit"
            onClick={() => changeMode("signin")}
          >
            Back to sign in <Icon name="arrow-forward" size={19} />
          </button>
          <button
            className="bu-auth-inline bu-auth-sent-back"
            onClick={() => changeMode(sent === "reset" ? "forgot" : "signup")}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          <div className="bu-auth-emblem">
            <Icon
              name={
                forgot
                  ? "key-outline"
                  : signup
                    ? "leaf-outline"
                    : "hand-left-outline"
              }
              size={29}
            />
          </div>
          <span className="bu-auth-eyebrow">
            {forgot
              ? "LET’S GET YOU BACK IN"
              : signup
                ? "MAKE ROOM FOR SOMETHING GOOD"
                : "YOUR NEXT CHAPTER STARTS HERE"}
          </span>
          <h1>
            {forgot ? (
              <>
                A fresh start.
                <br />
                For your password.
              </>
            ) : signup ? (
              <>
                Good things
                <br />
                start with you.
              </>
            ) : (
              <>
                Welcome back
                <br />
                to the good side.
              </>
            )}
          </h1>
          <p className="bu-auth-intro">
            {forgot
              ? "It happens. Enter your email and we’ll send you a link to reset your password."
              : signup
                ? "Join the loop. Turn your everyday plastic into a little more good."
                : "Your pickups, your points, your little bit of good. All right where you left them."}
          </p>
          <form className="bu-auth-form" onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy}>
              {signup && (
                <div className="bu-auth-field-row">
                  <label className="bu-auth-field">
                    Full name
                    <input
                      name="fullName"
                      autoComplete="name"
                      required
                      value={fields.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      placeholder="Your full name"
                    />
                  </label>
                  <label className="bu-auth-field">
                    Phone <span className="bu-auth-optional">(optional)</span>
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={fields.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="080 1234 5678"
                    />
                  </label>
                </div>
              )}
              <label className="bu-auth-field">
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={fields.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              {!forgot && (
                <PasswordInput
                  key={mode}
                  value={fields.password}
                  onChange={(e) => set("password", e.target.value)}
                  newPassword={signup}
                  disabled={busy}
                />
              )}
              {mode === "signin" && (
                <button
                  className="bu-auth-inline bu-auth-forgot"
                  type="button"
                  onClick={() => changeMode("forgot")}
                >
                  Forgot password?
                </button>
              )}
              {signup && (
                <label className="bu-auth-collector">
                  <input
                    type="checkbox"
                    checked={fields.wantsCollector}
                    onChange={(e) => set("wantsCollector", e.target.checked)}
                  />
                  <span>
                    <strong>I’d like to become a collector, too.</strong>
                    <small>
                      Help your neighbourhood recycle. Applications are reviewed
                      by the BottleUp team.
                    </small>
                  </span>
                  <Icon name="bicycle-outline" size={25} />
                </label>
              )}
              <Message error>{message}</Message>
              <button className="bu-auth-submit" disabled={busy} type="submit">
                {busy
                  ? "One moment…"
                  : forgot
                    ? "Send reset link"
                    : signup
                      ? "Create my account"
                      : "Sign in"}
                <Icon
                  name={busy ? "hourglass-outline" : "arrow-forward"}
                  size={19}
                />
              </button>
            </fieldset>
          </form>
          <p className="bu-auth-switch">
            {forgot ? (
              <button
                className="bu-auth-inline"
                onClick={() => changeMode("signin")}
                disabled={busy}
              >
                <Icon name="arrow-back" size={16} /> Back to sign in
              </button>
            ) : (
              <>
                {signup ? "Already part of the loop?" : "New to BottleUp?"}{" "}
                <button
                  className="bu-auth-inline"
                  disabled={busy}
                  onClick={() => changeMode(signup ? "signin" : "signup")}
                >
                  {signup ? "Sign in" : "Create an account"}
                </button>
              </>
            )}
          </p>
          <div className="bu-auth-trust">
            <Icon name="shield-checkmark-outline" size={16} />
            <span>Your account. Your recycling journey.</span>
          </div>
        </>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    if (password !== confirm) {
      setMessage("Those passwords don’t match. Give them another look.");
      return;
    }
    if (!supabase) {
      setMessage(
        "Account access is temporarily unavailable. Please try again later.",
      );
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
      setPassword("");
      setConfirm("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn’t update your password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout mode="reset" onBack={onDone}>
      <div className="bu-auth-emblem">
        <Icon
          name={saved ? "checkmark-circle-outline" : "lock-closed-outline"}
          size={31}
        />
      </div>
      <span className="bu-auth-eyebrow">
        {saved ? "ALL SET FOR MORE GOOD" : "A LITTLE RESET"}
      </span>
      <h1>
        {saved ? (
          <>
            Fresh start.
            <br />
            Same good you.
          </>
        ) : (
          <>
            New password.
            <br />
            Back in the loop.
          </>
        )}
      </h1>
      <p className="bu-auth-intro">
        {saved
          ? "Your password has been updated. Your recycling journey is right where you left it."
          : "Choose a password with at least 8 characters. Make it something only you know."}
      </p>
      {saved ? (
        <button className="bu-auth-submit" onClick={onDone}>
          Continue to BottleUp <Icon name="arrow-forward" size={19} />
        </button>
      ) : (
        <form className="bu-auth-form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            <PasswordInput
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              newPassword
              disabled={busy}
            />
            <PasswordInput
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              newPassword
              disabled={busy}
            />
            <Message error>{message}</Message>
            <button className="bu-auth-submit" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
              <Icon name="arrow-forward" size={19} />
            </button>
          </fieldset>
        </form>
      )}
    </AuthLayout>
  );
}

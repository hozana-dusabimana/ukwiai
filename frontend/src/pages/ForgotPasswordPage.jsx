import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { authApi } from "../api/endpoints";


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.forgot(email);
      setSent(true);
      toast.info("If the address is registered, a reset link has been sent.");
    } catch {
      toast.error("Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Brand panel — same as login/register */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-ukwi-700 via-ukwi-500 to-ukwi-100 text-white p-12 flex-col relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, white 1.5px, transparent 1.5px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)",
            backgroundSize: "50px 50px, 70px 70px",
          }}
        />
        <Link to="/" className="relative flex items-center gap-2 hover:opacity-90">
          <span className="text-3xl">🏗️</span>
          <span>
            <span className="block font-bold leading-tight">UKWI Monitor</span>
            <span className="block text-[11px] uppercase tracking-wide text-ukwi-100">
              Construction AI · Rwanda
            </span>
          </span>
        </Link>
        <div className="relative flex-1 flex flex-col justify-center max-w-md">
          <div className="text-xs uppercase tracking-wider text-ukwi-100 font-semibold">
            Account recovery
          </div>
          <h2 className="text-3xl xl:text-4xl font-bold mt-2 leading-tight">
            Locked out? We'll get you back in.
          </h2>
          <p className="text-ukwi-50 mt-4">
            Enter the email you used to register and we'll send a reset link. If your account exists,
            it'll arrive within a few minutes.
          </p>
        </div>
        <div className="relative text-xs text-ukwi-100">
          © {new Date().getFullYear()} UKWI Company Ltd · Internal use only
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <span className="text-2xl">🏗️</span>
            <span className="font-bold text-slate-800">UKWI Monitor</span>
          </Link>

          <div className="card">
            <h1 className="text-2xl font-bold text-slate-800">Reset password</h1>
            <p className="text-sm text-slate-500 mt-1">
              We'll email you a link to set a new password.
            </p>

            {sent ? (
              <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-semibold mb-1">Check your inbox</div>
                <div>If <span className="font-mono">{email}</span> is on file, a reset link is on its way.</div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4 mt-6">
                <div>
                  <label className="label" htmlFor="forgot-email">Email</label>
                  <input
                    id="forgot-email"
                    className="input"
                    type="email"
                    required
                    placeholder="you@ukwi.rw"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <button disabled={busy} className="btn-primary w-full">
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}

            <div className="mt-5 text-sm text-center text-slate-500">
              Remembered your password?{" "}
              <Link to="/login" className="text-ukwi-500 hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </div>

          <div className="text-center text-xs text-slate-500 mt-4">
            <Link to="/" className="hover:underline">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

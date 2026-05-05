import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { authApi } from "../api/endpoints";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await authApi.forgot(email);
      setSent(true);
      toast.info("If the address is registered, a reset link has been sent.");
    } catch (err) {
      toast.error("Request failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-xl font-bold mb-3">Forgot password</h1>
        {sent ? (
          <p className="text-sm text-slate-600">Check your email for the reset link.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button className="btn-primary w-full">Send reset link</button>
          </form>
        )}
        <div className="mt-3 text-sm text-center"><Link to="/login" className="text-ukwi-500 hover:underline">Back</Link></div>
      </div>
    </div>
  );
}

import React from "react";

type Props = { onSuccess: (email: string) => void };

const SignIn: React.FC<Props> = ({ onSuccess }) => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    // Accept anything for hackathon demo; persist token
    localStorage.setItem("auth_user", JSON.stringify({ email }));
    onSuccess(email);
  };

  return (
    <div className="container" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div className="card" style={{ maxWidth: 520, width: "100%" }}>
        <div className="card-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={(import.meta as any).env?.VITE_BRAND_ICON || "/nn.svg"} width={28} height={28} alt="Brand" style={{ borderRadius: 6 }} />
          Sign in to Executive Dashboard
        </div>
        <div className="card-body">
          <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Email</span>
              <input
                type="email"
                placeholder="example@novonordisk.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted">Password</span>
              <input
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
              />
            </label>
            {error && <div className="alert" role="alert">{error}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
                <input type="checkbox" defaultChecked /> Remember me
              </label>
              <button type="submit" className="btn btn-primary">Sign In</button>
            </div>
          </form>
          <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            By continuing you agree to our Terms and Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;


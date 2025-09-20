import React from "react";

type Props = { onSignOut?: () => void };

const Header: React.FC<Props> = ({ onSignOut }) => {
  const brandUrl = (import.meta as any).env?.VITE_BRAND_ICON || "/nn.svg";
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [theme, setTheme] = React.useState<string>(() => localStorage.getItem("theme") || "dark");
  const [avatar, setAvatar] = React.useState<string | null>(() => localStorage.getItem('avatar_data_url'));
  const [email] = React.useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('auth_user') || 'null')?.email || ''; } catch { return ''; }
  });
  const [lang, setLang] = React.useState<string>(() => localStorage.getItem('lang') || 'en');
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  React.useEffect(() => {
    const onScroll = () => setMenuOpen(false);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onAvatarChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      localStorage.setItem('avatar_data_url', url);
      setAvatar(url);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="header" role="banner">
      <div className="header-inner container" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="brand" aria-hidden style={{ background: "transparent", padding: 0 }}>
          <img src={brandUrl} alt="Brand" width={28} height={28} style={{ borderRadius: 8 }} />
        </div>
        <div className="title">
          <span style={{ fontSize: 18, fontWeight: 800 }}>InsightHub</span>
          <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 500 }}>Forecast Smarter. Allocate Better.</span>
        </div>
        <div className="toolbar" aria-label="toolbar" style={{ position: "relative" }}>
          <button className="btn btn-secondary" onClick={() => window.dispatchEvent(new CustomEvent('open-print-report'))}>Export PDF</button>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>Refresh</button>
          <button className="btn btn-secondary" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
            {avatar ? <img src={avatar} alt="avatar" width={18} height={18} style={{ borderRadius: '50%', marginRight: 6 }} /> : null}
            Account
          </button>
          {menuOpen && (
            <div ref={menuRef} role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, minWidth: 260, boxShadow: "0 10px 30px rgb(0 0 0 / 35%)" }}>
              <div style={{ padding: 12, borderBottom: "1px solid var(--border)", fontWeight: 600 }}>Account</div>
              <div style={{ padding: 12, display: "grid", gap: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: '#1f2937', display: 'grid', placeItems: 'center' }}>
                    {avatar ? (
                      <img src={avatar} alt="avatar" width={40} height={40} style={{ objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 18, fontWeight: 700 }}>
                        {(email || 'NN').slice(0,1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{email || 'Signed user'}</div>
                  </div>
                </div>
                <label className="btn btn-ghost" style={{ padding: '6px 8px', cursor: 'pointer', width: 'fit-content' }}>
                  Change photo
                  <input type="file" accept="image/*" onChange={onAvatarChange} style={{ display: 'none' }} />
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="muted">Language</span>
                  <select className="input" value={lang} onChange={(e)=>{ setLang(e.target.value); localStorage.setItem('lang', e.target.value); }}>
                    <option value="en">English</option>
                    <option value="da">Dansk</option>
                  </select>
                </div>
                <button className="btn btn-secondary">History (coming soon)</button>
                <button className="btn btn-secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Toggle {theme === "dark" ? "Light" : "Dark"} Mode</button>
                <button className="btn btn-ghost" onClick={onSignOut}>Sign Out</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;

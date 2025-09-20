import React from "react";

type TabKey = "summary" | "upload" | "estimate" | "dvs" | "fte" | "forecasting" | "admin";

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  disabled?: Partial<Record<TabKey, boolean>>;
};

const Tabs: React.FC<Props> = ({ active, onChange, disabled }) => {
  const [flash, setFlash] = React.useState<Partial<Record<TabKey, boolean>>>({});
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tabs?: TabKey[] } | undefined;
      const targets: TabKey[] = detail?.tabs || ["summary", "forecasting"];
      setFlash((s) => ({ ...s, ...Object.fromEntries(targets.map((t)=>[t,true])) }));
      const id = setTimeout(() => {
        setFlash((s) => {
          const m = { ...s }; targets.forEach((t)=> delete m[t]); return m;
        });
      }, 2500);
      return () => clearTimeout(id);
    };
    window.addEventListener('model-trained', handler as any);
    return () => window.removeEventListener('model-trained', handler as any);
  }, []);
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "summary", label: "Summary" },
    { key: "estimate", label: "Estimate vs Demand" },
    { key: "dvs", label: "Demand vs Supply" },
    { key: "fte", label: "FTE" },
    { key: "forecasting", label: "Forecasting" },
    { key: "upload", label: "Upload" },
    { key: "admin", label: "Admin" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        const isDisabled = disabled?.[t.key];
        return (
          <button
            key={t.key}
            className={`btn ${isActive ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => !isDisabled && onChange(t.key)}
            disabled={!!isDisabled}
            style={flash[t.key] ? { boxShadow: '0 0 0 6px rgba(34,197,94,0.28)' } : undefined}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

export type { TabKey };
export default Tabs;

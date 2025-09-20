import React from 'react';
import type { UploadResponse } from '../types';

// Keep filters lean to fit on one line (phase removed)
export type Filters = { project?: string; trial?: string; area?: string; quarter?: string; augmented?: boolean };

type Props = {
  data: UploadResponse;
  value: Filters;
  onChange: (f: Filters) => void;
};

const FiltersBar: React.FC<Props> = ({ data, value, onChange }) => {
  // Stage edits locally; apply on button press
  const [draft, setDraft] = React.useState<Filters>(value);
  React.useEffect(() => { setDraft(value); }, [JSON.stringify(value)]);
  const change = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const apply = () => onChange(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(value);
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-body filter-bar" style={{ flexWrap: 'nowrap', overflowX: 'auto', padding: '12px 16px' }}>
        <span className="label">Project</span>
        <select className="input" value={draft.project || ''} onChange={(e)=> change({ project: e.target.value || undefined })}>
          <option value="">All</option>
          {(data.filters?.projects || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="label">Trial</span>
        <select className="input" value={draft.trial || ''} onChange={(e)=> change({ trial: e.target.value || undefined })}>
          <option value="">All</option>
          {(data.filters?.trials || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="label">Area</span>
        <select className="input" value={draft.area || ''} onChange={(e)=> change({ area: e.target.value || undefined })}>
          <option value="">All</option>
          {(data.filters?.areas || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="label">Quarter</span>
        <select className="input" value={draft.quarter || ''} onChange={(e)=> change({ quarter: e.target.value || undefined })}>
          <option value="">All</option>
          {(data.filters?.quarters || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 10 }}>
          <span className="label">Dataset</span>
          <select
            className="input"
            value={draft.augmented ? 'aug' : 'real'}
            onChange={(e)=> change({ augmented: e.target.value === 'aug' })}
          >
            <option value="real">Real only</option>
            <option value="aug">Real + Synthetic</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={apply} disabled={!changed} title={changed ? 'Apply filters' : 'No changes'}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

export default FiltersBar;

import React from 'react';

type Block = { title: string; detail: string; tone?: 'good'|'warn'|'bad'|'neutral' };
type Props = { heading: string; items: Block[] };

const toneColor = (t?: Block['tone']) => (
  t === 'good' ? '#22c55e' : t === 'warn' ? '#f59e0b' : t === 'bad' ? '#ef4444' : '#64748b'
);

const InfoBlocks: React.FC<Props> = ({ heading, items }) => {
  return (
    <div className="card">
      <div className="card-header">{heading}</div>
      <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {items.map((b, i) => (
          <div key={i} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, color: toneColor(b.tone), marginBottom: 4 }}>{b.title}</div>
            <div className="muted">{b.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InfoBlocks;


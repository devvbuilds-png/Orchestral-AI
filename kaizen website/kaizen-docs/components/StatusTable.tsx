type StatusItem = {
  label: string;
  status: 'live' | 'planned' | 'progress';
};

const statusConfig = {
  live: { dot: '✓', dotClass: 'status-dot-live', badge: 'live', badgeClass: 'status-badge-live' },
  planned: { dot: '○', dotClass: 'status-dot-planned', badge: 'planned', badgeClass: 'status-badge-planned' },
  progress: { dot: '○', dotClass: 'status-dot-planned', badge: 'in progress', badgeClass: 'status-badge-progress' },
};

export default function StatusTable({ items }: { items: StatusItem[] }) {
  return (
    <table className="status-table">
      <tbody>
        {items.map((item, i) => {
          const cfg = statusConfig[item.status];
          return (
            <tr key={i}>
              <td style={{ width: 24, paddingRight: 0 }}>
                <span className={cfg.dotClass}>{cfg.dot}</span>
              </td>
              <td className="status-label">{item.label}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span className={cfg.badgeClass}>{cfg.badge}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

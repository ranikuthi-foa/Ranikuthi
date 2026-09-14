export default function DataTable({ columns, rows, emptyMessage = 'No records yet.' }) {
  if (!rows || rows.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{emptyMessage}</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={{
              textAlign: col.numeric ? 'right' : 'left',
              padding: '0.7em 1em',
              fontSize: 13,
              fontWeight: 600,
              borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id || i} style={{ borderBottom: '1px solid var(--color-border)' }}>
            {columns.map((col) => (
              <td key={col.key} className={col.numeric ? 'num' : ''} style={{ padding: '0.7em 1em', fontSize: 14 }}>
                {col.render ? col.render(row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

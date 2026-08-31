/**
 * TableSkeleton — drop-in replacement for the loading spinner inside tables.
 *
 * Props:
 *   columns  — array of Tailwind width classes, one per column
 *              e.g. ['w-8', 'w-24', 'w-40', 'w-16', 'w-20']
 *   rows     — number of placeholder rows to show (default: 6)
 *
 * Usage:
 *   {loading ? (
 *     <TableSkeleton columns={['w-8', 'w-24', 'w-40', 'w-16', 'w-20']} />
 *   ) : currentItems.map(...)}
 */
export default function TableSkeleton({ columns = [], rows = 6 }) {
  return Array.from({ length: rows }).map((_, rowIdx) => (
    <tr key={rowIdx} className="border-b border-slate-100">
      {columns.map((width, colIdx) => (
        <td key={colIdx} className="px-6 py-[1.125rem]">
          <div className={`h-3.5 bg-slate-200 rounded-full animate-pulse ${width}`} />
        </td>
      ))}
    </tr>
  ));
}

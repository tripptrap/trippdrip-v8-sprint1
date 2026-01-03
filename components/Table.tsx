"use client";
export default function Table({ columns, rows, onRowClick }:{
  columns: {key:string,label:string,render?:(row:any)=>any}[];
  rows: any[];
  onRowClick?: (row:any)=>void;
}){
  return (
    <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-white">
          <tr>{columns.map(c => <th key={c.key} className="text-left px-3 py-2">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i} className={`border-t border-slate-200 dark:border-slate-700 ${onRowClick?'cursor-pointer hover:bg-white':''}`} onClick={()=>onRowClick?.(r)}>
              {columns.map(c => <td key={c.key} className="px-3 py-2">{c.render?c.render(r):r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

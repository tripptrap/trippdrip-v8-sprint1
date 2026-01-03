export default function Pill({children}:{children:React.ReactNode}) {
  return <span className="inline-block px-2 py-1 text-xs rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">{children}</span>;
}

export default function Row({label,children}:{label:string,children:React.ReactNode}){
  return (
    <div className="grid grid-cols-12 gap-3 items-center">
      <div className="col-span-12 md:col-span-4 text-sm text-[var(--muted)]">{label}</div>
      <div className="col-span-12 md:col-span-8">{children}</div>
    </div>
  );
}

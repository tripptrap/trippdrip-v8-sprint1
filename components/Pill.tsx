export default function Pill({children}:{children:React.ReactNode}) {
  return <span className="inline-block px-2 py-1 text-xs rounded-full bg-white/10 border border-white/10">{children}</span>;
}

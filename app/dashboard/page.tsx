export default function Dashboard(){
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card">Reply Rate: <strong>32%</strong></div>
        <div className="card">Active Campaigns: <strong>3</strong></div>
        <div className="card">Unreads: <strong>7</strong></div>
      </div>
    </div>
  );
}

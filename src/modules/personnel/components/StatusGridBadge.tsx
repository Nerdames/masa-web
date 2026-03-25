export function StatusGridBadge({ status }: { status: "active" | "locked" | "disabled" }) {
  if (status === "active") {
    return (
      <div className="flex items-center gap-1.5 text-emerald-600">
        <i className="bx bx-check-circle text-sm" />
        <span className="text-[11px] font-medium">Active</span>
      </div>
    );
  }
  if (status === "disabled") {
    return (
      <div className="flex items-center gap-1.5 text-slate-400 opacity-80">
        <i className="bx bx-minus-circle text-sm" />
        <span className="text-[11px] font-medium">Disabled</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-amber-600">
      <i className="bx bx-lock-alt text-sm" />
      <span className="text-[11px] font-medium">Locked</span>
    </div>
  );
}
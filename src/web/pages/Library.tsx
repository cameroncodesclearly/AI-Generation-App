import { useState } from "react";
import type { Generation } from "../../shared/types";
import { api } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { GenerationCard } from "../components/generation";
import { Empty } from "../components/ui";

export default function Library() {
  const [kind, setKind] = useState<"" | "image" | "video" | "text">("");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const feed = usePoll(() => api.get<{ generations: Generation[] }>(`/api/generations?scope=${scope}&limit=100${kind ? `&kind=${kind}` : ""}`), 6000, true, [kind, scope]);
  const items = feed.data?.generations ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">{scope === "mine" ? "Your work" : "Team work"}</div><h1 className="display text-4xl">Library</h1></div>
        <div className="flex flex-wrap gap-2">
          {(["mine", "team"] as const).map((s) => <button key={s} className={`chip ${scope === s ? "chip-on" : ""}`} onClick={() => setScope(s)}>{s === "mine" ? "Mine" : "Whole team"}</button>)}
          <span className="mx-1 opacity-30">|</span>
          {([["", "All"], ["image", "Images"], ["video", "Video"], ["text", "Copy"]] as const).map(([k, l]) => <button key={k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>{l}</button>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((g) => <GenerationCard key={g.id} g={g} onDelete={scope === "mine" ? async (id) => { await api.del(`/api/generations/${id}`); void feed.reload(); } : undefined} />)}
      </div>
      {!feed.loading && !items.length && <Empty title="Nothing here yet">Generate something and it will be kept here, with its prompt, so you can reuse it.</Empty>}
    </div>
  );
}

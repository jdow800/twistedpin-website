import { useEffect, useState, type ReactNode } from "react";
import type { BarActor } from "../api";
import { listFoodQuestions } from "../food-questions-api";

type Dest = "count" | "countfood" | "kegcheck" | "upload" | "invoices" | "counts" | "pricewatch" | "pourcosts" | "mappours" | "recipes" | "teachergroup" | "foodvariance" | "foodcost" | "foodrecipes" | "foodquestions" | "foodtrends" | "opsinbox" | "brunswickfood" | "beveragecost" | "tapinventory" | "menueconomics";

interface Tile { view: Dest; icon: string; title: string; sub: string }

const QUESTIONS: Tile = { view: "foodquestions", icon: "💬", title: "My recipe questions", sub: "A few kitchen details · save each answer" };
const OPS_INBOX: Tile = { view: "opsinbox", icon: "📥", title: "Operations inbox", sub: "Priorities, evidence and corrections" };
const COUNT: Tile[] = [
  { view: "count", icon: "🥃", title: "Count liquor", sub: "Voice or tap · bottles by zone" },
  { view: "countfood", icon: "🧊", title: "Count food", sub: "Voice or tap · kitchen shelves" },
  { view: "kegcheck", icon: "🛢️", title: "Keg check", sub: "Kegs + bottled beer" },
];
const INVOICES: Tile[] = [
  { view: "upload", icon: "🧾", title: "Upload invoice", sub: "Photos or PDF" },
  { view: "invoices", icon: "📁", title: "Recent invoices", sub: "Last 60 days" },
];
const REPORTS: Tile[] = [
  { view: "foodcost", icon: "💵", title: "Food cost", sub: "Food + NA cost vs sales, count to count" },
  { view: "foodvariance", icon: "🍕", title: "Food variance", sub: "Used vs what the recipes say sold" },
  { view: "foodtrends", icon: "📊", title: "Food cost trends", sub: "Weighted costs from stored report versions" },
  { view: "counts", icon: "📋", title: "Recent counts", sub: "Submitted inventories" },
  { view: "beveragecost", icon: "🍹", title: "Beverage cost", sub: "Inventory dollars and matching sales periods" },
  { view: "tapinventory", icon: "🍺", title: "Tap inventory", sub: "Observe remaining stock independently of sales" },
  { view: "pourcosts", icon: "🍸", title: "Pour cost", sub: "Spirit recipe costs · consumables separate" },
  { view: "pricewatch", icon: "📈", title: "Price watch", sub: "Cost per ounce · changes of 5%+" },
  { view: "brunswickfood", icon: "🎳", title: "Brunswick food revenue", sub: "Review front-desk department sales" },
  { view: "menueconomics", icon: "🏷️", title: "Menu economics & prices", sub: "Recipe costs, sales mix and reviewed price decisions" },
];
const SETUP: Tile[] = [
  { view: "foodrecipes", icon: "📖", title: "Food recipes & yields", sub: "Ingredients, portions and report corrections" },
  { view: "recipes", icon: "📝", title: "Recipes", sub: "Give drinks & options a recipe" },
  { view: "mappours", icon: "🔗", title: "Map pours", sub: "Match spirit buttons to bottles" },
  { view: "teachergroup", icon: "🍎", title: "Teacher Group Organizer", sub: "Their food sheet → lanes + kitchen packet" },
];

/** The front door, grouped by why someone opens it: what is waiting on them,
 * counting, invoices, then reports and setup as compact tiles. Everyone keeps
 * every tile; the operations inbox leads only for people who can act on it. */
export default function Home({
  actor,
  onGo,
}: {
  actor: BarActor;
  onGo: (dest: Dest) => void;
}) {
  const first = actor.displayName.split(" ")[0] ?? actor.displayName;
  const canManage = actor.permissions.includes("bar.manage");
  const waiting = useWaitingQuestions();
  const big = (tile: Tile, badge?: string | null) => (
    <button key={tile.view} type="button" className="lq-action" onClick={() => onGo(tile.view)}>
      <span className="lq-action-emoji" aria-hidden="true">{tile.icon}</span>
      <span className="lq-action-title">{tile.title}</span>
      <span className="lq-action-sub">{tile.sub}</span>
      {badge && <span className="lq-action-badge">{badge}</span>}
    </button>
  );
  const small = (tile: Tile) => (
    <button key={tile.view} type="button" className="lq-home-tile" onClick={() => onGo(tile.view)}>
      <span className="lq-home-tile-icon" aria-hidden="true">{tile.icon}</span>
      <span className="lq-home-tile-title">{tile.title}</span>
      <span className="lq-home-tile-sub">{tile.sub}</span>
    </button>
  );
  return (
    <div className="lq-home">
      <p className="lq-hi">Hi, {first}.</p>
      <HomeSection label="To do">
        {big(QUESTIONS, waiting ? `${waiting} waiting` : null)}
        {canManage && big(OPS_INBOX)}
      </HomeSection>
      <HomeSection label="Count">{COUNT.map(tile => big(tile))}</HomeSection>
      <HomeSection label="Invoices">{INVOICES.map(tile => big(tile))}</HomeSection>
      <HomeSection label="Reports" compact>{REPORTS.map(small)}</HomeSection>
      <HomeSection label="Recipes & setup" compact>{[...SETUP, ...(canManage ? [] : [OPS_INBOX])].map(small)}</HomeSection>
    </div>
  );
}

function HomeSection({ label, compact = false, children }: { label: string; compact?: boolean; children: ReactNode }) {
  const id = `lq-home-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="lq-home-section" aria-labelledby={id}>
      <h2 className="lq-section-label" id={id}>{label}</h2>
      <div className={compact ? "lq-home-tiles" : "lq-actions"}>{children}</div>
    </section>
  );
}

/** Questions in delivered batches still to answer, plus answers waiting on a
 * reviewer for people who review. The tile works without the count. */
function useWaitingQuestions(): number | null {
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    listFoodQuestions().then(index => {
      if (live) setWaiting(index.batches.reduce((sum, batch) => sum + batch.unanswered, 0)
        + (index.canReview ? index.pendingReview.length : 0));
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return waiting;
}

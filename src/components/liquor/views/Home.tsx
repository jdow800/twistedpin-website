import type { BarActor } from "../api";

type Dest = "count" | "countfood" | "kegcheck" | "upload" | "invoices" | "counts" | "pricewatch" | "pourcosts" | "mappours" | "recipes" | "teachergroup" | "foodvariance" | "foodcost" | "foodrecipes" | "foodtrends" | "opsinbox" | "brunswickfood" | "beveragecost" | "tapinventory" | "menueconomics";

export default function Home({
  actor,
  onGo,
}: {
  actor: BarActor;
  onGo: (dest: Dest) => void;
}) {
  const first = actor.displayName.split(" ")[0] ?? actor.displayName;
  return (
    <div className="lq-home">
      <p className="lq-hi">Hi, {first}.</p>
      <div className="lq-actions">
        <button type="button" className="lq-action" onClick={() => onGo("count")}>
          <span className="lq-action-emoji" aria-hidden="true">🥃</span>
          <span className="lq-action-title">Count liquor</span>
          <span className="lq-action-sub">Voice or tap · bottles by zone</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("countfood")}>
          <span className="lq-action-emoji" aria-hidden="true">🧊</span>
          <span className="lq-action-title">Count food</span>
          <span className="lq-action-sub">Voice or tap · kitchen shelves</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("kegcheck")}>
          <span className="lq-action-emoji" aria-hidden="true">🛢️</span>
          <span className="lq-action-title">Keg check</span>
          <span className="lq-action-sub">Kegs + bottled beer</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("upload")}>
          <span className="lq-action-emoji" aria-hidden="true">🧾</span>
          <span className="lq-action-title">Upload invoice</span>
          <span className="lq-action-sub">Photos or PDF</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("teachergroup")}>
          <span className="lq-action-emoji" aria-hidden="true">🍎</span>
          <span className="lq-action-title">Teacher Group Organizer</span>
          <span className="lq-action-sub">Their food sheet → lanes + kitchen packet</span>
        </button>

        <p className="lq-section-label">Review</p>
        {[
          { view: "opsinbox", title: "Operations inbox", sub: "Priorities, evidence and corrections" },
          { view: "foodrecipes", title: "Food recipes & yields", sub: "Ingredients, portions and report corrections" },
          { view: "foodtrends", title: "Food cost trends", sub: "Weighted costs from stored report versions" },
          { view: "brunswickfood", title: "Brunswick food revenue", sub: "Review front-desk department sales" },
          { view: "beveragecost", title: "Beverage cost", sub: "Inventory dollars and matching sales periods" },
          { view: "tapinventory", title: "Tap inventory", sub: "Observe remaining stock independently of sales" },
          { view: "menueconomics", title: "Menu economics & prices", sub: "Recipe costs, sales mix and reviewed price decisions" },
        ].map(item => <button key={item.view} type="button" className="lq-action" onClick={() => onGo(item.view as Dest)}><span className="lq-action-title">{item.title}</span><span className="lq-action-sub">{item.sub}</span></button>)}
        <button type="button" className="lq-action" onClick={() => onGo("invoices")}>
          <span className="lq-action-emoji" aria-hidden="true">📁</span>
          <span className="lq-action-title">Recent invoices</span>
          <span className="lq-action-sub">Last 60 days</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("counts")}>
          <span className="lq-action-emoji" aria-hidden="true">📋</span>
          <span className="lq-action-title">Recent counts</span>
          <span className="lq-action-sub">Submitted inventories</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("foodvariance")}>
          <span className="lq-action-emoji" aria-hidden="true">🍕</span>
          <span className="lq-action-title">Food variance</span>
          <span className="lq-action-sub">Used vs what the recipes say sold</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("foodcost")}>
          <span className="lq-action-emoji" aria-hidden="true">🧾</span>
          <span className="lq-action-title">Food cost</span>
          <span className="lq-action-sub">Food + NA cost vs sales, count to count</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("pricewatch")}>
          <span className="lq-action-emoji" aria-hidden="true">📈</span>
          <span className="lq-action-title">Price watch</span>
          <span className="lq-action-sub">Cost per ounce · changes of 5%+</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("pourcosts")}>
          <span className="lq-action-emoji" aria-hidden="true">🍸</span>
          <span className="lq-action-title">Pour cost</span>
          <span className="lq-action-sub">Spirit recipe costs · consumables separate</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("mappours")}>
          <span className="lq-action-emoji" aria-hidden="true">🔗</span>
          <span className="lq-action-title">Map pours</span>
          <span className="lq-action-sub">Match spirit buttons to bottles</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("recipes")}>
          <span className="lq-action-emoji" aria-hidden="true">📝</span>
          <span className="lq-action-title">Recipes</span>
          <span className="lq-action-sub">Give drinks & options a recipe</span>
        </button>
      </div>
    </div>
  );
}

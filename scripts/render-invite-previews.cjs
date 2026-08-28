/**
 * Render the LIVE TPRS invitation templates (apps/backend/views) statically for
 * every look x event type into public/invite-previews/ (the shareable, unindexed
 * gallery at /invite-previews/). Run after any theme change:
 *
 *   PREVIEW=1 node scripts/render-invite-previews.cjs
 *
 * Requires the tprs checkout at ../tprs (sibling of this repo). PREVIEW=1 renders
 * the read-only preview mode (ribbon + inert RSVP form) - always use it here.
 */
const path = require("path"); const fs = require("fs");
const { Eta } = require(require("path").resolve(__dirname, "..", "..", "tprs", "apps", "backend", "node_modules", "eta"));
const eta = new Eta({ views: require("path").resolve(__dirname, "..", "..", "tprs", "apps", "backend", "views") });
const path0 = require("path"); const out = process.argv[2] || path0.join(__dirname, "..", "public", "invite-previews");
const win = { date_display: "Thursday, September 3, 2026", start_time_display: "5:00 PM", end_time_display: "9:00 PM" };
const base = { cancelled:false, event_over:false, event_started:false, rsvp_open:true, venue_address:"15610 Joliet Rd, Plainfield, IL 60544", window: win };
const shapes = {
  catered: { shape:"catered", title:"Marcus Turns 40", host_display_name:"Danielle Ortiz", tagline:"Good food, open lanes, nothing to clean up.", note:"come hungry", max_party_size:4 },
  kids: { shape:"kids", title:"Maya's 8th Birthday", host_display_name:"Priya Raman", tagline:"Lanes, cake, and the good kind of chaos.", note:"the suite's ready for takeover", max_party_size:6 },
  fundraiser: { shape:"fundraiser", title:"Awesome Organization Fundraiser Night", host_display_name:"Victoria Conner", tagline:"Bowl for a cause. Make sure to tell the front desk you are there for our fundraiser!", note:"lanes are first come, first served", max_party_size:12 },
  shower: { shape:"catered", title:"Danielle's Baby Shower", host_display_name:"Marisol Vega", tagline:"Good food, open lanes, nothing to clean up.", note:"come hungry", max_party_size:null },
};
const LOOKS = ["classic","confetti-strike","one-night-only","answered-poster","morning-light","letterpress-ceremony","eight-oclock-cover"]; const SHAPES = ["catered","kids","fundraiser"];
const jobs = process.argv.length > 3 ? process.argv.slice(3).map(s => s.split(":")) : LOOKS.flatMap(l => SHAPES.map(s => [l, s]));
for (const [theme, shape] of jobs) {
  const view = { ...base, ...shapes[shape], theme, photo_url: process.env.PHOTO || null };
  const html = eta.render("guest/invitation", { view, token:"PREVIEWTOKEN", calendar:{ google:"#", ics:"#" }, echo:{}, formError:null, rsvpFlash:null, preview: process.env.PREVIEW === "1", customize:false });
  fs.writeFileSync(path.join(out, theme + "--" + shape + ".html"), html);
  console.log("rendered", theme, shape, html.length);
}

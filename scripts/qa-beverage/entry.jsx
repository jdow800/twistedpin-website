import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "../../src/styles/global.css";
import "../../src/components/liquor/liquor.css";
import BeverageCost from "../../src/components/liquor/views/BeverageCost";
import TapInventory from "../../src/components/liquor/views/TapInventory";
function Harness(){const [view,setView]=useState("tap");return <div className="lq-app"><button onClick={()=>setView("tap")}>Tap QA</button><button onClick={()=>setView("cost")}>Cost QA</button>{view==="tap" ? <TapInventory onDone={()=>setView("cost")} canManage canCount/> : <BeverageCost onDone={()=>setView("tap")} canManage/>}</div>;}
createRoot(document.getElementById("root")).render(<Harness/>);

import {createRoot} from 'react-dom/client';
import BookingWizard from '../../src/components/tprs/BookingWizard';
import {bookingPageConfig} from '../../src/tprs/pageConfig';
import '../../src/styles/global.css';
const mode=await(await fetch('/__owner_review__')).json();
createRoot(document.getElementById('root')!).render(<>
 <aside role="status" style={{maxWidth:1100,margin:'16px auto',padding:16,border:'2px solid #ec9b55',borderRadius:7}}>
  <strong>{mode.live?'OWNER PAYMENT TEST':'OWNER REVIEW — PAYMENT DISABLED'}</strong><br/>
  {mode.live?<>This makes a real reservation and card payment. Use your designated phone and email. The reward uses 350 points. We’ll verify the kiosk balance, then cancel and refund the test booking.</>:<>Real catalog and prices. This page cannot hold lanes, book, charge a card, or send messages. The test reward remains switched off until the payment trial is ready.</>}
 </aside>
 <main style={{maxWidth:1100,margin:'0 auto',padding:20}}><BookingWizard config={bookingPageConfig}/></main>
</>);

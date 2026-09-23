import {createRoot} from 'react-dom/client';
import BookingWizard from '../../src/components/tprs/BookingWizard';
import {bookingPageConfig} from '../../src/tprs/pageConfig';
import '../../src/styles/global.css';
const fixture=await(await fetch('/__fixture__')).json();
const config={...bookingPageConfig,productCodes:[9000,9001,9002,9003],defaultDate:fixture.eventDate,tileArt:undefined,heroImage:undefined,windowNotice:undefined,cardNotes:undefined,termsText:'Local test booking only. No real reservation or charge.'};
createRoot(document.getElementById('root')!).render(<>
 <aside style={{maxWidth:1100,margin:'0 auto',padding:16,fontSize:12}}>LOCAL TEST ONLY · Synthetic guest · {fixture.offline?'Simulated payment':'Stripe sandbox payment'}<br/>Use {fixture.email} and {fixture.phone}. Starting balance: 350 points.{fixture.ownerPreview && <><br/>Try sharing it: use {fixture.recipientEmail} and {fixture.recipientPhone}. The original test account supplies the points.</>}</aside>
 <main style={{maxWidth:1100,margin:'0 auto',padding:20}}><BookingWizard config={config}/></main>
</>);

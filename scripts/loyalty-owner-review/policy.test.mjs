import test from 'node:test';
import assert from 'node:assert/strict';
import {allowRequest} from './policy.mjs';
const context={code:'OWNERTEST',phone:'3155550101'};
for(const [method,path,body] of [
 ['POST','/api/cart/items',[]],['DELETE','/api/cart/items/line',undefined],
 ['POST','/api/checkout/payment-intents',{}],['POST','/api/checkout/convert',{}],
 ['POST','/api/forms/upload',{}],['POST','/api/loyalty/invitations',{}],
 ['GET','/api/cart',undefined],['GET','/admin/discounts',undefined],
 ['POST','/api/checkout/quote',{couponCode:'OTHER'}],
 ['POST','/api/checkout/coupon-preview',{phone:'8155550199',couponCode:'OWNERTEST'}],
 ['POST','/api/checkout/quote',{customerIdentity:{phone:'8155550199'}}],
 ['POST','/api/checkout/quote',[]]
])test(method+' '+path+' rejects writes/unapproved identity',()=>assert.equal(allowRequest({...context,method,path,body}),false));
test('Read-only catalog and owner quote allowed',()=>{
 assert(allowRequest({...context,method:'GET',path:'/api/products/bookable'}));
 assert(allowRequest({...context,method:'POST',path:'/api/checkout/quote',body:{couponCode:'OWNERTEST',phone:'+1 (315) 555-0101'}}));
 assert(allowRequest({...context,method:'POST',path:'/api/checkout/quote',body:{}}));
});

/* SmartDine QR Billing — protected, read-only restaurant order display. */
'use strict';
(async () => {
 const $ = id => document.getElementById(id);
 const sd=window.sd;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const orderId=new URLSearchParams(location.search).get('order')||'';
 const fail=msg=>{const el=$('bill-message');el.textContent=msg;el.className='bill-message error';el.hidden=false;};
 if(!sd?.ready)return fail('Could not connect to SmartDine QR. Try again when online.');
 if(!uuid.test(orderId))return fail('Invalid order reference. Open a bill from your Owner Dashboard.');
 try {
   // Supabase RLS is enforced on every query in addition to explicit restaurant_id filters.
   const {data:auth,error:authError}=await sd.client.auth.getUser();
   if(authError||!auth?.user)return fail('Owner Login required. Sign in and open the bill from Orders.');
   const {data:restaurant,error:rErr}=await sd.client.from('restaurants')
     .select('id,name,tagline').eq('owner_id',auth.user.id).maybeSingle();
   if(rErr)throw rErr;
   if(!restaurant)return fail('No restaurant is associated with this owner account.');
   const {data:order,error:oErr}=await sd.client.from('orders')
     .select('id,restaurant_id,table_number,status,payment_state,total_amount,paid_at,created_at')
     .eq('id',orderId).eq('restaurant_id',restaurant.id).maybeSingle();
   if(oErr)throw oErr;
   if(!order)return fail('Order not found, or you do not have permission to view it.');
   const {data:items,error:iErr}=await sd.client.from('order_items')
     .select('item_name,quantity,unit_price').eq('order_id',order.id)
     .eq('restaurant_id',restaurant.id).order('id',{ascending:true});
   if(iErr)throw iErr;
   if(!items?.length)return fail('This order has no item details. A complete bill cannot be generated.');
   const addText=(id,value)=>{$(id).textContent=String(value??'');};
   const paid=order.payment_state==='paid',refunded=order.payment_state==='refunded';
   addText('bill-restaurant',restaurant.name);
   addText('bill-tagline',restaurant.tagline||'');
   addText('bill-type',paid?'PAYMENT RECEIPT':'ORDER BILL');
   addText('bill-reference',String(order.id).slice(0,8).toUpperCase());
   addText('bill-table','Table '+order.table_number);
   addText('bill-created',new Date(order.created_at).toLocaleString('en-IN'));
   addText('bill-order-status',order.status[0].toUpperCase()+order.status.slice(1));
   const badge=$('bill-payment-badge');
   badge.textContent=paid?'PAID':refunded?'REFUNDED':'PAYMENT PENDING';
   badge.className='state '+(paid?'paid':refunded?'refunded':'pending');
   const body=$('bill-items');body.replaceChildren();
   const td=(value,className)=>{const e=document.createElement('td');e.textContent=String(value);if(className)e.className=className;return e;};
   let subtotal=0;
   for(const row of items){
     const price=Number(row.unit_price),qty=Number(row.quantity);
     const amount=Math.round(qty*price*100)/100;
     subtotal+=amount;
     const tr=document.createElement('tr');
     tr.append(td(row.item_name),td(qty,'right'),td(sd.money(price),'right'),td(sd.money(amount),'right'));
     body.append(tr);
   }
   const total=Number(order.total_amount);
   const diff=Math.round((total-subtotal)*100)/100;
   if(Math.abs(diff)>=.01){$('bill-adjustment-row').hidden=false;addText('bill-adjustment',sd.money(diff));}
   addText('bill-total',sd.money(total));
   addText('bill-payment-note',paid?'Payment received and recorded by the restaurant.':refunded?'Restaurant record: payment refunded.':'Payment has not been confirmed. Please pay the restaurant.');
   addText('bill-paid-at',paid&&order.paid_at?'Payment recorded: '+new Date(order.paid_at).toLocaleString('en-IN'):'');
   $('bill-message').hidden=true;$('bill-actions').hidden=false;$('bill-receipt').hidden=false;
   $('bill-print').addEventListener('click',()=>window.print());
 }catch(err){fail('Unable to load the bill. '+(err?.message||'Please try again.'));}
})();

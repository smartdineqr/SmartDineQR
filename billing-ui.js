/* SmartDine QR Billing — owner-only billing access. Does not modify order/payment data. */
'use strict';
(async () => {
 const $=id=>document.getElementById(id),sd=window.sd;
 const root=$('sd-billing-list'),refresh=$('sd-billing-refresh');
 if(!root||!sd?.ready)return;
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const make=(tag,cl,text)=>{const el=document.createElement(tag);if(cl)el.className=cl;if(text!==undefined)el.textContent=text;return el;};
 const notice=text=>{root.replaceChildren(make('p','muted',text));};
 let restaurant=null,busy=false;
 async function load(){
   if(busy)return;
   busy=true;refresh.disabled=true;
   notice('Loading your restaurant bills…');
   try{
     const {data:auth,error:authError}=await sd.client.auth.getUser();
     if(authError||!auth?.user){notice('Owner Login required.');return;}
     if(!restaurant){
       const {data,error}=await sd.client.from('restaurants')
         .select('id').eq('owner_id',auth.user.id).maybeSingle();
       if(error)throw error;
       if(!data){notice('Create your restaurant to start billing.');return;}
       restaurant=data;
     }
     const {data:orders,error}=await sd.client.from('orders')
       .select('id,table_number,created_at,total_amount,status,payment_state')
       .eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).limit(60);
     if(error)throw error;
     root.replaceChildren();
     if(!orders?.length){notice('No orders to bill yet.');return;}
     for(const order of orders){
       if(!UUID.test(order.id))continue;
       const row=make('article','sd-bill-row');
       const detail=make('div','sd-bill-detail');
       detail.append(make('strong','',`Table ${order.table_number} · ${sd.money(order.total_amount)}`));
       detail.append(make('small','',`${new Date(order.created_at).toLocaleString('en-IN')} · ${order.status} · ${order.payment_state}`));
       const a=make('a','button small sd-bill-btn','View / Print bill');
       a.href='bill.html?order='+encodeURIComponent(order.id);
       a.target='_blank';a.rel='noopener noreferrer';
       row.append(detail,a);root.append(row);
     }
   }catch(err){notice('Could not load bills: '+(err?.message||'Unknown error'));}
   finally{busy=false;refresh.disabled=false;}
 }
 refresh.addEventListener('click',()=>void load());
 void load();
})();

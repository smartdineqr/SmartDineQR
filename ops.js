'use strict';
(async()=>{
 const $=id=>document.getElementById(id);
 const {client,ready,notice,money,escape:esc,activeSubscription}=window.sd;
 let restaurant,tableRows=[],selectedTable=null,orders=[],orderItems=[],refreshing=false;
 const menuLink=t=>new URL('customer.html?t='+encodeURIComponent(t.table_token),location.href).href;
 if(!ready){notice('Supabase Config লোড হয়নি।','error');return;}
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth?.user){location.replace('login.html');return;}
 const {data:restaurantData,error:rErr}=await client.from('restaurants').select('id,name,plan,trial_ends_at,paid_until').eq('owner_id',auth.user.id).maybeSingle();
 if(rErr||!restaurantData){notice('Restaurant Account পাওয়া যাচ্ছে না। প্রথমে Owner Dashboard-এ Restaurant তৈরি করো।','error');return;}
 restaurant=restaurantData;$('restaurant-name').textContent=restaurant.name;
 const writable=activeSubscription(restaurant);
 $('trial-badge').textContent=writable?'Ordering available':'Trial / subscription expired';
 $('trial-badge').className='badge'+(writable?'':' warn');
 $('content').hidden=false;$('message').hidden=true;$('add-table').disabled=!writable;
 if(!writable)notice('Trial/Subscription শেষ। পুরোনো Orders দেখা যাবে, নতুন QR Table তৈরি করা যাবে না।','warn');
 async function loadTables(){
  const {data,error}=await client.from('restaurant_tables').select('id,table_number,table_token,created_at').eq('restaurant_id',restaurant.id).order('table_number');
  if(error){notice('Table load failed: '+error.message,'error');return;}
  tableRows=data||[];
  const root=$('table-list');root.replaceChildren();
  if(!tableRows.length){const p=document.createElement('p');p.className='muted';p.textContent='কোনো Table QR নেই। প্রথম Table Number দিয়ে Add করো।';root.append(p);}
  for(const t of tableRows){
   const line=document.createElement('div');line.className='list-row';
   const label=document.createElement('strong');label.textContent='Table '+t.table_number;
   const controls=document.createElement('div');controls.className='buttons';
   const show=document.createElement('button');show.className='btn';show.textContent='Show QR';show.onclick=()=>showQR(t);
   const del=document.createElement('button');del.className='btn danger';del.textContent='Remove';del.disabled=!writable;
   del.onclick=async()=>{if(!confirm('Remove Table '+t.table_number+' QR? Old orders remain, but this QR stops working.'))return;
      const {error:e}=await client.from('restaurant_tables').delete().eq('id',t.id).eq('restaurant_id',restaurant.id);
      if(e)notice(e.message,'error');else{if(selectedTable?.id===t.id){selectedTable=null;$('qr-view').hidden=true;$('qr-empty').hidden=false;}
       notice('QR Table removed','success');loadTables();}};
   controls.append(show,del);line.append(label,controls);root.append(line);
  }
 }
 function showQR(t){
   selectedTable=t;$('qr-empty').hidden=true;$('qr-view').hidden=false;
   $('qr-title').textContent='Table '+t.table_number;
   const url=menuLink(t);$('qr-link').textContent=url;$('open-link').href=url;
   $('qr-code').replaceChildren();
   if(typeof QRCode==='function'){
     new QRCode($('qr-code'),{text:url,width:164,height:164,colorDark:'#113e37',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
   }else{$('qr-code').textContent='QR image unavailable (check internet). Copy menu link instead.';}
 }
 $('copy-link').onclick=async()=>{if(!selectedTable)return;try{await navigator.clipboard.writeText(menuLink(selectedTable));notice('QR Menu Link copied','success');}catch{notice('Copy failed. Long-press the link and copy it.','warn');}};
 $('print-qr').onclick=()=>window.print();
 $('table-form').onsubmit=async e=>{
  e.preventDefault();if(!writable)return;
  const table_number=Number($('table-no').value);
  if(!Number.isInteger(table_number)||table_number<1||table_number>1000)return;
  $('add-table').disabled=true;
  const {error}=await client.from('restaurant_tables').insert({restaurant_id:restaurant.id,table_number});
  if(error)notice('Table creation failed: '+error.message,'error');else{$('table-no').value='';notice('Table QR created in cloud','success');await loadTables();}
  $('add-table').disabled=false;
 };
 function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
 async function loadOrders(){
  if(refreshing)return;refreshing=true;$('refresh').disabled=true;
  try{
   const [r1,r2]=await Promise.all([
     client.from('orders').select('id,table_number,status,total_amount,payment_state,created_at').eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).limit(60),
     client.from('order_items').select('order_id,item_name,quantity,unit_price').eq('restaurant_id',restaurant.id).limit(1000)
   ]);
   if(r1.error||r2.error)throw r1.error||r2.error;
   orders=r1.data||[];orderItems=r2.data||[];
   renderOrders();
  }catch(e){notice('Orders load failed: '+e.message,'error');}
  finally{$('refresh').disabled=false;refreshing=false;}
 }
 function renderOrders(){
  const list=$('orders-list');list.replaceChildren();
  if(!orders.length){list.append(el('p','muted','এই Restaurant-এর Cloud Database-এ এখনো কোনো Order নেই।'));return;}
  for(const order of orders){
   const card=el('article','panel order-box');
   const head=el('div','row between wrap-row');
   const label=el('h3','order-title','Table '+order.table_number+' • '+money(order.total_amount));
   const state=el('span','pill',order.payment_state==='paid'?'Paid':'Unpaid');head.append(label,state);
   const items=orderItems.filter(i=>i.order_id===order.id);
   const description=el('p','order-items',items.length?items.map(i=>i.quantity+' × '+i.item_name).join(' • '):'No item details');
   const date=el('p','muted small',new Date(order.created_at).toLocaleString('en-IN')+' · '+order.id.slice(0,8));
   const actions=el('div','buttonbar');
   const status=el('select');status.setAttribute('aria-label','Order status');
   for(const opt of ['new','preparing','ready','served','cancelled']){
     const o=document.createElement('option');o.value=opt;o.textContent=opt[0].toUpperCase()+opt.slice(1);o.selected=opt===order.status;status.append(o);
   }
   status.disabled=['served','cancelled'].includes(order.status);
   status.onchange=async()=>{
     status.disabled=true;
     const {error}=await client.rpc('smartdine_update_order_status',{p_order_id:order.id,p_status:status.value});
     if(error)notice('Status update failed: '+error.message,'error');else notice('Order marked '+status.value,'success');await loadOrders();
   };
   actions.append(status);
   if(order.payment_state!=='paid'&&order.status!=='cancelled'){
     const pay=el('button','btn primary','Confirm cash received');
     pay.type='button';pay.title='Record only after cash has actually been received';
     pay.onclick=async()=>{if(!confirm('Only continue if CASH has really been received. This is NOT an online payment.'))return;
       pay.disabled=true;
       const {error}=await client.rpc('smartdine_confirm_cash',{p_order_id:order.id});
       if(error)notice('Could not record cash: '+error.message,'error');else notice('Cash payment recorded','success');await loadOrders();};
     actions.append(pay);
   }
   card.append(head,description,date,actions);list.append(card);
  }
 }
 $('refresh').onclick=loadOrders;
 await Promise.all([loadTables(),loadOrders()]);
 setInterval(()=>{if(document.visibilityState==='visible')loadOrders();},15000);
})();

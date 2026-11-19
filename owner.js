'use strict';
(async () => {
 const { $,client,ready,escape:esc,money,notice,activeSubscription,canExpense } = window.sd;
 let restaurant=null,user=null,menu=[],orders=[],expenses=[],orderItems=[];
 const allTabs=['overview','menu','orders','finance','settings','billing'];
 function tab(name){
   if(!allTabs.includes(name))return;
   document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===name));
   for(const n of allTabs) $('tab-'+n).hidden=n!==name;
 }
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
 $('logout').onclick=async()=>{if(client)await client.auth.signOut();location.replace('login.html');};
 if(!ready){$('loading').textContent='Supabase Connect করা হয়নি। SETUP.md অনুসারে supabase-config.js পূরণ করো।';return;}
 const auth=await client.auth.getUser();user=auth.data?.user;
 if(!user){location.replace('login.html');return;}
 $('account-label').textContent=user.email||'Verified owner';
 $('loading').hidden=true;
 async function loadRestaurant(){
   const {data,error}=await client.from('restaurants').select('id,name,tagline,owner_id,trial_ends_at,plan,paid_until').eq('owner_id',user.id).maybeSingle();
   if(error){notice('Database setup/check failed: '+error.message,'error');return;}
   restaurant=data;
   if(!restaurant){$('setup').hidden=false;$('portal').hidden=true;return;}
   $('setup').hidden=true;$('portal').hidden=false;
   $('restaurant-title').textContent=restaurant.name;
   const label = new Date(restaurant.trial_ends_at)>new Date()?'Trial active':restaurant.paid_until && new Date(restaurant.paid_until)>new Date()?restaurant.plan+' active':'Trial / subscription expired';
   $('plan-badge').textContent=label;
   $('settings-name').value=restaurant.name;$('settings-tagline').value=restaurant.tagline||'';
   const days=Math.max(0,Math.ceil((new Date(restaurant.trial_ends_at)-new Date())/86400000));
   $('subscription-status').innerHTML='<p>Plan: <strong>'+esc(restaurant.plan.toUpperCase())+'</strong></p><p>Trial remaining: <strong>'+days+' days</strong></p><p>After trial, a paid subscription is required for new changes and ordering.</p>';
   const writable=activeSubscription(restaurant);
   $('menu-form').querySelectorAll('input,select,button').forEach(input=>input.disabled=!writable);
   $('expenses-panel').hidden=!canExpense(restaurant);
   if(!writable)notice('Trial বা Paid Plan শেষ হয়েছে। পুরোনো তথ্য দেখা যাবে; নতুন Menu Changes আপাতত বন্ধ।','warn');
   await reloadAll();
 }
 $('setup-form').onsubmit=async e=>{
   e.preventDefault();const name=$('setup-name').value.trim(),tagline=$('setup-tagline').value.trim();
   if(!name)return;
   const btn=e.submitter;btn.disabled=true;
   const {error}=await client.from('restaurants').insert({owner_id:user.id,name,tagline});
   if(error)notice(error.message,'error');else {notice('Restaurant created! 30-day trial started.','success');await loadRestaurant();}
   btn.disabled=false;
 };
 async function reloadAll(){
   const r=restaurant.id;
   const queries=await Promise.all([
     client.from('menu_items').select('id,name,category,price,cost,discount_pct,is_available').eq('restaurant_id',r).order('created_at',{ascending:false}),
     client.from('orders').select('id,table_number,status,total_amount,payment_state,paid_at,created_at').eq('restaurant_id',r).order('created_at',{ascending:false}).limit(500),
     client.from('expenses').select('id,title,amount,expense_date').eq('restaurant_id',r).order('expense_date',{ascending:false}).limit(500),
     client.from('order_items').select('order_id,quantity,unit_cost').eq('restaurant_id',r).limit(1000)
   ]);
   if(queries.some(q=>q.error)) {notice('Cloud Data Load Error: '+queries.find(q=>q.error).error.message,'error');return;}
   [menu,orders,expenses,orderItems]=queries.map(q=>q.data||[]);
   renderMenu();renderOrders();renderExpenses();renderStats();
 }
 const localDate=d=>{const date=new Date(d),z=n=>String(n).padStart(2,'0');return date.getFullYear()+'-'+z(date.getMonth()+1)+'-'+z(date.getDate());};
 function renderStats(){
   const today=localDate(new Date()),month=today.slice(0,7);
   const paid=orders.filter(o=>o.payment_state==='paid' && o.paid_at);
   const paidMonth=paid.filter(o=>localDate(o.paid_at).startsWith(month));
   const todaySales=paid.filter(o=>localDate(o.paid_at)===today).reduce((n,o)=>n+Number(o.total_amount),0);
   const monthSales=paidMonth.reduce((n,o)=>n+Number(o.total_amount),0);
   const expMonth=expenses.filter(e=>String(e.expense_date).startsWith(month)).reduce((n,e)=>n+Number(e.amount),0);
   const paidMonthIds=new Set(paidMonth.map(o=>o.id));
   const foodCosts=orderItems.filter(i=>paidMonthIds.has(i.order_id)).reduce((n,i)=>n+Number(i.quantity)*Number(i.unit_cost),0);
   $('today-sales').textContent=money(todaySales);$('month-sales').textContent=money(monthSales);$('month-orders').textContent=String(paidMonth.length);$('menu-count').textContent=String(menu.length);
   $('finance-sales').textContent=money(monthSales);$('finance-expenses').textContent=money(expMonth);$('finance-costs').textContent=money(foodCosts);
   $('finance-profit').textContent=canExpense(restaurant)?money(monthSales-expMonth-foodCosts):'Pro / Premium';
 }
 function renderMenu(){
   $('menu-list').innerHTML=menu.length?menu.map(item=>'<article class="item-card"><div><strong>'+esc(item.name)+'</strong><small>'+esc(item.category)+' • '+money(item.price)+' • '+item.discount_pct+'% off • '+(item.is_available?'Available':'Unavailable')+'</small></div><div class="actions"><button class="button small" data-edit="'+item.id+'">Edit</button><button class="button small danger" data-remove="'+item.id+'">Delete</button></div></article>').join(''):'<div class="empty">এখনো কোনো খাবার যোগ করা হয়নি। উপরের Form দিয়ে প্রথম খাবার যোগ করো।</div>';
   $('menu-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
     const item=menu.find(m=>m.id===b.dataset.edit);if(!item)return;
     $('food-id').value=item.id;$('food-name').value=item.name;$('food-category').value=item.category;
     $('food-price').value=item.price;$('food-cost').value=item.cost;$('food-discount').value=item.discount_pct;$('food-available').value=String(item.is_available);
     $('save-food').textContent='Update food';window.scrollTo({top:0,behavior:'smooth'});
   });
   $('menu-list').querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{
     if(!activeSubscription(restaurant)||!confirm('Remove this food?'))return;
     const {error}=await client.from('menu_items').delete().eq('id',b.dataset.remove).eq('restaurant_id',restaurant.id);
     if(error)notice(error.message,'error');else {notice('Food removed.','success');reloadAll();}
   });
 }
 function clearFood(){$('menu-form').reset();$('food-id').value='';$('food-cost').value='0';$('food-discount').value='0';$('save-food').textContent='Save food';}
 $('cancel-edit').onclick=clearFood;
 $('menu-form').onsubmit=async e=>{
   e.preventDefault();if(!restaurant||!activeSubscription(restaurant))return notice('Subscription expired','warn');
   const obj={restaurant_id:restaurant.id,name:$('food-name').value.trim(),category:$('food-category').value.trim(),price:Number($('food-price').value),cost:Number($('food-cost').value),discount_pct:Number($('food-discount').value),is_available:$('food-available').value==='true'};
   if(!obj.name||!obj.category||!(obj.price>0)||obj.cost<0||obj.discount_pct<0||obj.discount_pct>100)return notice('Food details যাচাই করো।','warn');
   const id=$('food-id').value;let response;
   if(id){const {restaurant_id,...patch}=obj;response=await client.from('menu_items').update(patch).eq('id',id).eq('restaurant_id',restaurant.id);}
   else response=await client.from('menu_items').insert(obj);
   if(response.error)notice(response.error.message,'error');else {clearFood();notice('Menu cloud-এ সেভ হয়েছে।','success');await reloadAll();}
 };
 function renderOrders(){
   $('orders-list').innerHTML=orders.length?orders.map(o=>'<article class="item-card"><div><strong>Table '+esc(o.table_number)+' • '+money(o.total_amount)+'</strong><small>'+esc(o.status)+' • '+esc(o.payment_state)+' • '+new Date(o.created_at).toLocaleString('en-IN')+'</small></div></article>').join(''):'<div class="empty">Cloud Database-এ কোনো Order নেই।</div>';
 }
 function renderExpenses(){
   $('expenses-list').innerHTML=expenses.length?expenses.map(e=>'<article class="item-card"><div><strong>'+esc(e.title)+'</strong><small>'+esc(e.expense_date)+' • '+money(e.amount)+'</small></div></article>').join(''):'<div class="empty">এই Restaurant-এর কোনো Expense নেই।</div>';
 }
 $('expense-form').onsubmit=async e=>{
   e.preventDefault();if(!restaurant||!canExpense(restaurant))return notice('Expenses require active Trial/Pro/Premium.','warn');
   const title=$('expense-title').value.trim(),amount=Number($('expense-amount').value);if(!title||!(amount>0))return;
   const {error}=await client.from('expenses').insert({restaurant_id:restaurant.id,title,amount});
   if(error)notice(error.message,'error');else {e.target.reset();notice('Expense saved in cloud','success');reloadAll();}
 };
 $('settings-form').onsubmit=async e=>{
   e.preventDefault();if(!restaurant)return;
   const name=$('settings-name').value.trim(),tagline=$('settings-tagline').value.trim();if(!name)return;
   const {error}=await client.from('restaurants').update({name,tagline}).eq('id',restaurant.id);
   if(error)notice(error.message,'error');else {notice('Restaurant settings saved.','success');await loadRestaurant();}
 };
 await loadRestaurant();
})();

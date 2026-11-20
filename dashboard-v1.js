/* SmartDine QR Dashboard v1: additional owner UI, QR and kitchen.
   This file deliberately does not replace the existing owner.js or Supabase configuration. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const sd = window.sd;
  const contentNames = new Set(['overview','orders','kitchen','menu','more','finance','tableqr','settings','billing']);
  const moreNames = new Set(['more','finance','tableqr','settings','billing']);
  let restaurant = null, writable = false, tables = [], selectedTable = null;
  let kitchenBusy = false, tableBusy = false, analyticsBusy = false;
  let currentKitchenOrders = [], currentKitchenItems = [];

  const safeMoney = amount => sd && typeof sd.money === 'function'
    ? sd.money(amount) : '₹' + (Number(amount)||0).toFixed(2);
  const setText = (id, value) => { const node=$(id); if(node)node.textContent=String(value); };
  function operationMessage(message, kind='success') {
    const root=$('sd-ops-message');
    if(!root)return;
    root.textContent=message;
    root.className='message '+kind;
    root.hidden=false;
  }
  function node(tag, cls, txt) {
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(txt!==undefined)e.textContent=String(txt);
    return e;
  }
  function go(tab) {
    if (!contentNames.has(tab)) return;
    document.querySelectorAll('#portal .tab-content').forEach(section => {
      section.hidden = section.id !== 'tab-'+tab;
    });
    const mainTab = moreNames.has(tab)?'more':tab;
    document.querySelectorAll('.sd-nav-button').forEach(button => {
      const active=button.dataset.tab===mainTab;
      button.classList.toggle('selected',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    if(tab==='kitchen')void loadKitchen();
    if(tab==='tableqr')void loadTables();
    if(tab==='finance')void loadAnalytics();
    if(window.innerWidth<701)window.scrollTo({top:0,behavior:'smooth'});
  }
  // owner.js handles its existing tab names; the listener below finalizes the new layout.
  document.querySelectorAll('#portal [data-tab]').forEach(button=>{
    button.addEventListener('click',()=>go(button.dataset.tab));
  });
  document.querySelectorAll('[data-go]').forEach(button=>{
    button.addEventListener('click',()=>go(button.dataset.go));
  });
  const notify=$('sd-notify'); if(notify)notify.addEventListener('click',()=>go('kitchen'));
  const refreshKitchenButton=$('sd-kitchen-refresh');
  if(refreshKitchenButton)refreshKitchenButton.addEventListener('click',()=>loadKitchen());
  const refreshHomeButton=$('sd-home-refresh');
  if(refreshHomeButton)refreshHomeButton.addEventListener('click',()=>window.location.reload());

  const localDate = d => {
    const date=new Date(d),z=n=>String(n).padStart(2,'0');
    return date.getFullYear()+'-'+z(date.getMonth()+1)+'-'+z(date.getDate());
  };
  function displayTrialAndFeatures() {
    if(!restaurant || !sd)return;
    const exp=restaurant.trial_ends_at && new Date(restaurant.trial_ends_at);
    const valid=exp && Number.isFinite(+exp) && +exp>Date.now();
    if(valid){
      const days=Math.max(0,Math.ceil((+exp-Date.now())/86400000));
      setText('sd-trial-days',days+' days remaining in free trial');
    }else if(restaurant.paid_until && new Date(restaurant.paid_until)>new Date()){
      setText('sd-trial-days','Paid subscription active');
    }else setText('sd-trial-days','Subscription required to continue ordering');
    const canTrack=typeof sd.canExpense==='function' && sd.canExpense(restaurant);
    document.querySelectorAll('.sd-pro-only').forEach(e=>e.hidden=!canTrack);
    const upgrade=$('sd-analytics-upgrade'); if(upgrade)upgrade.hidden=!!canTrack;
  }
  function countsUpdate() {
    const orders=currentKitchenOrders;
    const news=orders.filter(o=>o.status==='new').length;
    const preparing=orders.filter(o=>o.status==='preparing').length;
    const ready=orders.filter(o=>o.status==='ready').length;
    setText('sd-home-new',news);
    setText('sd-home-inprogress',preparing+ready);
    setText('sd-k-new',news);
    setText('sd-k-preparing',preparing);
    setText('sd-k-ready',ready);
    for(const id of ['sd-notify-count','sd-nav-new']){
      const element=$(id);
      if(element){element.textContent=String(news);element.hidden=(news===0);}
    }
  }
  async function loadKitchen() {
    if(!restaurant||!sd?.client||kitchenBusy)return;
    kitchenBusy=true;
    if(refreshKitchenButton)refreshKitchenButton.disabled=true;
    try {
      const r=restaurant.id;
      const [ord,it]=await Promise.all([
        sd.client.from('orders').select('id,table_number,status,total_amount,payment_state,created_at').eq('restaurant_id',r).order('created_at',{ascending:false}).limit(60),
        sd.client.from('order_items').select('order_id,item_name,quantity').eq('restaurant_id',r).limit(1000)
      ]);
      if(ord.error||it.error)throw ord.error||it.error;
      currentKitchenOrders=ord.data||[];
      currentKitchenItems=it.data||[];
      countsUpdate();
      renderKitchen();
    }catch(error){
      operationMessage('Order load failed: '+(error.message||error),'error');
    }finally{
      kitchenBusy=false;
      if(refreshKitchenButton)refreshKitchenButton.disabled=false;
    }
  }
  function renderKitchen() {
    const root=$('sd-kitchen-orders'); if(!root)return;
    root.replaceChildren();
    if(!currentKitchenOrders.length){root.append(node('div','empty','এখনো কোনো অর্ডার নেই। Table QR থেকে অর্ডার এলে এখানে দেখা যাবে।'));return;}
    for(const order of currentKitchenOrders){
      const card=node('article','sd-kitchen-card');
      const top=node('div','sd-kitchen-top');
      const left=node('div');
      left.append(node('strong','',`Table ${order.table_number} • ${safeMoney(order.total_amount)}`));
      left.append(node('p','sd-order-meta',new Date(order.created_at).toLocaleString('en-IN')));
      const pill=node('span','sd-pill '+order.status,order.status==='new'?'New':order.status[0].toUpperCase()+order.status.slice(1));
      top.append(left,pill);
      const items=currentKitchenItems.filter(i=>i.order_id===order.id);
      const desc=node('p','sd-kitchen-items',items.length?items.map(i=>`${i.quantity} × ${i.item_name}`).join(' • '):'Item details unavailable');
      const controls=node('div','sd-kitchen-controls');
      const select=node('select');
      select.setAttribute('aria-label',`Change status for table ${order.table_number}`);
      for(const status of ['new','preparing','ready','served','cancelled']){
        const opt=node('option','',status.charAt(0).toUpperCase()+status.slice(1));
        opt.value=status;
        select.append(opt);
      }
      select.value=order.status;
      if(order.status==='served'||order.status==='cancelled')select.disabled=true;
      select.addEventListener('change',async()=>{
        const newStatus=select.value;
        if(newStatus==='new'){select.value=order.status;return;}
        select.disabled=true;
        try{
          const {error}=await sd.client.rpc('smartdine_update_order_status',{p_order_id:order.id,p_status:newStatus});
          if(error)throw error;
          operationMessage(`Table ${order.table_number}: ${newStatus} saved`);
        }catch(err){operationMessage('Order status failed: '+err.message,'error');}
        await loadKitchen();
      });
      controls.append(select);
      if(order.payment_state==='paid'){
        controls.append(node('span','sd-pill ready','Cash / payment marked paid'));
      } else if(order.status!=='cancelled'){
        const cash=node('button','button primary','Confirm Cash Received');
        cash.type='button';
        cash.addEventListener('click',async()=>{
          if(!window.confirm('Have you actually received CASH for this order? This is not an online payment.'))return;
          cash.disabled=true;
          try{
            const {error}=await sd.client.rpc('smartdine_confirm_cash',{p_order_id:order.id});
            if(error)throw error;
            operationMessage('Cash recorded manually. Refresh Overview for sales totals.');
          }catch(err){operationMessage('Cash confirmation failed: '+err.message,'error');}
          await loadKitchen();
          if(window.sdCloudStats?.refresh)void window.sdCloudStats.refresh();
        });
        controls.append(cash);
      }
      controls.append(node('small','',order.payment_state==='paid'?'Paid':'Unpaid'));
      card.append(top,desc,controls);
      root.append(card);
    }
  }
  const menuUrl=table=>new URL('customer.html?t='+encodeURIComponent(table.table_token),window.location.href).href;
  async function loadTables() {
    if(!restaurant||!sd?.client||tableBusy)return;
    tableBusy=true;
    try{
      const {data,error}=await sd.client.from('restaurant_tables')
        .select('id,table_number,table_token').eq('restaurant_id',restaurant.id).order('table_number');
      if(error)throw error;
      tables=data||[];
      renderTables();
    }catch(err){
      const root=$('sd-tables-list');if(root)root.replaceChildren(node('div','message error','Table load failed: '+err.message));
    }finally{tableBusy=false;}
  }
  function renderTables(){
    const root=$('sd-tables-list'); if(!root)return;
    root.replaceChildren();
    if(!tables.length){root.append(node('div','empty','কোনো Table নেই। প্রথম Table Number দিয়ে Create QR চাপো।'));return;}
    for(const t of tables){
      const row=node('div','sd-table-row');
      const label=node('strong','',`Table ${t.table_number}`);
      const actions=node('div','actions');
      const show=node('button','button small','Show QR');show.type='button';show.addEventListener('click',()=>showQR(t));
      const remove=node('button','button small danger','Remove');remove.type='button';remove.disabled=!writable;
      remove.addEventListener('click',async()=>{
        if(!window.confirm(`Remove Table ${t.table_number}? Its QR link will stop working.`))return;
        remove.disabled=true;
        const {error}=await sd.client.from('restaurant_tables').delete().eq('id',t.id).eq('restaurant_id',restaurant.id);
        if(error)operationMessage(error.message,'error');
        else{
          if(selectedTable?.id===t.id){selectedTable=null;$('sd-qr-view').hidden=true;$('sd-qr-empty').hidden=false;}
          operationMessage('Table QR removed');
        }
        await loadTables();
      });
      actions.append(show,remove);row.append(label,actions);root.append(row);
    }
  }
  function showQR(table){
    selectedTable=table;
    $('sd-qr-empty').hidden=true;
    $('sd-qr-view').hidden=false;
    setText('sd-qr-title','Table '+table.table_number);
    const url=menuUrl(table);
    setText('sd-qr-url',url);
    $('sd-qr-open').href=url;
    const box=$('sd-qr-canvas');box.replaceChildren();
    if(typeof window.QRCode==='function'){
      new window.QRCode(box,{text:url,width:170,height:170,colorDark:'#103e37',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
    }else box.append(node('p','muted','QR image unavailable. Copy the customer link below.'));
  }
  const tableForm=$('sd-table-form');
  if(tableForm)tableForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!restaurant||!sd||!writable){operationMessage('Active subscription required to create tables.','warn');return;}
    const table_number=Number($('sd-table-number').value);
    if(!Number.isInteger(table_number)||table_number<1||table_number>1000){operationMessage('Enter a valid table number.','warn');return;}
    const add=$('sd-table-add');add.disabled=true;
    try{
      const {error}=await sd.client.from('restaurant_tables').insert({restaurant_id:restaurant.id,table_number});
      if(error)throw error;
      tableForm.reset();operationMessage('Table QR created and saved in cloud.');
      await loadTables();
    }catch(err){operationMessage('Table creation failed: '+err.message,'error');}
    finally{add.disabled=!writable;}
  });
  const copy=$('sd-qr-copy');if(copy)copy.addEventListener('click',async()=>{
    if(!selectedTable)return;
    const url=menuUrl(selectedTable);
    try {await navigator.clipboard.writeText(url);operationMessage('Customer link copied');}
    catch {window.prompt('Copy this customer link:',url);}
  });
  async function loadAnalytics(){
    // Statistics are aggregated server-side without client pagination.
    if(window.sdCloudStats?.refresh) await window.sdCloudStats.refresh();
  }
  let isInitialized=false, isInitializing=false;
  async function initialize(){
    if(isInitialized||isInitializing)return;
    isInitializing=true;
    try {
    if(!sd?.ready||!sd.client)return;
    const {data:auth,error}=await sd.client.auth.getUser();
    if(error||!auth?.user)return; // owner.js performs redirects.
    const {data,error:restaurantError}=await sd.client.from('restaurants')
      .select('id,owner_id,trial_ends_at,paid_until,plan').eq('owner_id',auth.user.id).maybeSingle();
    if(restaurantError||!data)return; // first-time setup remains with owner.js.
    restaurant=data;
    isInitialized=true;
    writable=typeof sd.activeSubscription==='function'&&sd.activeSubscription(restaurant);
    $('sd-table-add').disabled=!writable;
    displayTrialAndFeatures();
    await Promise.all([loadKitchen(),loadTables(),loadAnalytics()]);
    // Preserve the selected dashboard section across safe page refreshes.
    const savedSection=window.location.hash.slice(1).toLowerCase();
    if(contentNames.has(savedSection))go(savedSection);
    // Order status is polled only while visible; this is NOT realtime push.
    window.setInterval(()=>{
      if(document.visibilityState==='visible' && !$('portal').hidden)void loadKitchen();
    },15000);
    } finally {isInitializing=false;}
  }
  const portalRoot=$('portal');
  if(portalRoot){
    const observer=new MutationObserver(()=>{
      if(isInitialized){observer.disconnect();return;}
      if(!portalRoot.hidden)void initialize().catch(err=>operationMessage('Dashboard initialization: '+err.message,'error'));
    });
    observer.observe(portalRoot,{attributes:true,attributeFilter:['hidden']});
  }
  void initialize().catch(err=>operationMessage('Dashboard initialization: '+err.message,'error'));
})();

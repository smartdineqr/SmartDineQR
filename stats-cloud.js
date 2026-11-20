/* SmartDine QR v1.3 — exact aggregated owner statistics.
 * Uses the owner-scoped PostgreSQL smartdine_owner_stats() function.
 * Does not store or duplicate restaurant data in localStorage.
 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const sd = window.sd;
  if (!sd?.ready || !$('portal')) return;

  let lastResult = null, inFlight = false, lastFetch = 0;
  const status = $('sd-stats-status');
  const money = n => sd.money(Number(n) || 0);
  const format = value => String(value ?? '0');
  function set(id, value) {
    const el = $(id);
    if (el && el.textContent !== value) el.textContent = value;
  }
  function draw() {
    const d = lastResult;
    if (!d) return;
    set('today-sales',money(d.today_sales));
    set('month-sales',money(d.month_sales));
    set('month-orders',format(d.month_paid_orders));
    set('menu-count',format(d.menu_count));
    set('finance-sales',money(d.month_sales));
    set('finance-expenses',d.can_expense?money(d.month_expenses):'Pro / Premium');
    set('finance-costs',d.can_expense?money(d.month_food_cost):'Pro / Premium');
    set('finance-profit',d.can_expense?money(d.estimated_profit):'Pro / Premium');
    const pending = $('sd-home-new');
    // New order counts in Kitchen are refreshed separately every 15 seconds.
    if (pending && pending.textContent==='—') pending.textContent=format(d.new_orders);
    const chart=$('sd-sales-chart');
    if(chart && Array.isArray(d.last_7_days)){
      chart.replaceChildren();
      const max=Math.max(1,...d.last_7_days.map(x=>Number(x.sales)||0));
      for(const row of d.last_7_days){
        const group=document.createElement('div');group.className='sd-chart-day';
        const amount=document.createElement('span');amount.className='sd-chart-amount';
        amount.textContent=money(row.sales);
        const bar=document.createElement('div');bar.className='sd-chart-bar';
        bar.style.height=(Number(row.sales)>0?Math.max(5,Math.round(120*Number(row.sales)/max)):3)+'px';
        bar.title=row.day+': '+money(row.sales);
        const label=document.createElement('small');
        label.textContent=new Date(row.day+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short'});
        group.append(amount,bar,label);chart.append(group);
      }
    }
  }
  async function refresh(){
    if (inFlight || $('portal').hidden) return;
    inFlight=true;
    try {
      const {data,error}=await sd.client.rpc('smartdine_owner_stats');
      if(error)throw error;
      if (!data || !Array.isArray(data.last_7_days)) throw new Error('Invalid statistics response');
      lastResult=data;lastFetch=Date.now();draw();
      if(status){status.hidden=false;status.textContent='Sales based on confirmed payments • Timezone: Asia/Kolkata';status.className='hint';}
    } catch (err) {
      if(status){status.hidden=false;status.textContent='Sales report could not load. Check 01-safe-upgrade.sql and refresh. '+(err.message||'');status.className='message warn';}
      // Never silently claim partial client-side numbers are the complete totals.
      lastResult=null;
      ['today-sales','month-sales','month-orders','finance-sales','finance-expenses','finance-costs','finance-profit']
        .forEach(id=>set(id,'—'));
    } finally {inFlight=false;}
  }
  window.sdCloudStats={refresh};
  const portal=$('portal');
  const readyObserver=new MutationObserver(()=>{if(!portal.hidden)void refresh();});
  readyObserver.observe(portal,{attributes:true,attributeFilter:['hidden']});

  // Protect accurate PostgreSQL totals from being overwritten by the older limited list renderer.
  const statsIds=['today-sales','month-sales','month-orders','menu-count','finance-sales','finance-expenses','finance-costs','finance-profit'];
  const fixObserver=new MutationObserver(()=>{
    if(!lastResult)return;
    queueMicrotask(draw);
  });
  for(const id of statsIds){const el=$(id);if(el)fixObserver.observe(el,{childList:true,characterData:true,subtree:true});}

  let updateScheduled=false;
  function scheduleRefresh(){
    if(updateScheduled)return;
    updateScheduled=true;
    setTimeout(()=>{updateScheduled=false;void refresh();},1100);
  }
  for(const id of ['expenses-list','orders-list']){
    const el=$(id);
    if(el)new MutationObserver(()=>{
      if(lastResult && Date.now()-lastFetch>800)scheduleRefresh();
    }).observe(el,{childList:true});
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible' && !portal.hidden) void refresh();
  });
  if(!portal.hidden)void refresh();
  setInterval(()=>{if(document.visibilityState==='visible' && !portal.hidden)void refresh();},30000);
})();

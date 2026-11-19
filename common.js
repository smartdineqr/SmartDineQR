'use strict';
window.sd = (() => {
  const $ = id => document.getElementById(id);
  const config = window.SMARTDINE_CONFIG || {};
  const ready = !!(config.url && config.publishableKey && window.supabase);
  const client = ready ? window.supabase.createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  }) : null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => '₹' + Number(value || 0).toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2});
  const notice = (message,kind='info') => {
    const target = $('message');
    if (!target) return;
    target.textContent=message; target.className='message ' + kind; target.hidden=false;
  };
  function setBusy(button, busy) { if (button) button.disabled=busy; }
  const activeSubscription = r => !!r && (new Date(r.trial_ends_at)>new Date() || (r.paid_until && new Date(r.paid_until)>new Date()));
  const canExpense = r => !!r && (new Date(r.trial_ends_at)>new Date() || (['pro','premium'].includes(r.plan) && r.paid_until && new Date(r.paid_until)>new Date()));
  return { $, client, ready, escape, money, notice, setBusy, activeSubscription, canExpense };
})();

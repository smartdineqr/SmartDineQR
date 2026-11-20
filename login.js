'use strict';
(async () => {
 const {$,client,ready,notice} = window.sd;
 let mode='login',isRecovery=false;
 const form=$('auth-form'),submit=$('submit-auth'),password=$('password');
 function changeMode(next){
   mode=next;
   $('tab-login').classList.toggle('selected',next==='login');
   $('tab-signup').classList.toggle('selected',next==='signup');
   $('form-title').textContent=next==='signup'?'Create owner account':next==='recovery'?'Choose a new password':'Welcome back';
   $('form-intro').textContent=next==='signup'?'প্রথম Account তৈরি করো। Email Verify করার পর Login করবে।':next==='recovery'?'নতুন Password সেট করো।':'নিজের রেস্টুরেন্টের তথ্য দেখতে Login করো।';
   $('password-label').textContent=next==='recovery'?'New password':'Password';
   $('password').autocomplete=next==='login'?'current-password':'new-password';
   submit.textContent=next==='signup'?'Create account':next==='recovery'?'Update password':'Login securely';
   $('forgot-password').hidden=next!=='login';
   $('email').closest('form').querySelector('label[for="email"]').hidden=next==='recovery';
   $('email').hidden=next==='recovery';
   $('email').required=next!=='recovery';
   if(next==='recovery'){$('tab-login').hidden=true;$('tab-signup').hidden=true;}
 }
 $('tab-login').onclick=()=>changeMode('login');
 $('tab-signup').onclick=()=>changeMode('signup');
 $('toggle-password').onclick=()=>{password.type=password.type==='password'?'text':'password';$('toggle-password').textContent=password.type==='password'?'Show':'Hide';};
 if(!ready){notice('Supabase এখনো Connect করা হয়নি। প্রথমে SETUP.md অনুযায়ী Project তৈরি করে supabase-config.js সেট করো।','warn');submit.disabled=true;return;}
 // Supabase recovery callback is recognized from the redirect URL.
 const url=new URL(location.href); const hash=new URLSearchParams(url.hash.slice(1));
 isRecovery = url.searchParams.get('type')==='recovery'||hash.get('type')==='recovery';
 client.auth.onAuthStateChange((event)=>{
   if(event==='PASSWORD_RECOVERY'){isRecovery=true;changeMode('recovery');}
 });
 const {data:{session}}=await client.auth.getSession();
 if(session && !isRecovery)location.replace('owner.html');
 if(isRecovery)changeMode('recovery');
 else if(url.searchParams.get('signup')==='1')changeMode('signup');
 $('forgot-password').onclick=async()=>{
   const email=$('email').value.trim();if(!email){notice('Password reset link পেতে Email ID লেখো।','warn');return;}
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('login.html',location.href).href});
   notice(error?error.message:'Account থাকলে Reset Password Link Email-এ পাঠানো হবে।',error?'error':'success');
 };
 form.onsubmit=async e=>{
  e.preventDefault();submit.disabled=true;
  const email=$('email').value.trim(),pw=password.value;
  try {
   if(mode==='recovery'){
    const {error}=await client.auth.updateUser({password:pw}); if(error)throw error;
    notice('Password বদলানো হয়েছে। এবার Dashboard-এ যাও।','success');
    setTimeout(()=>location.replace('owner.html'),900);
   } else if(mode==='signup'){
    const {data,error}=await client.auth.signUp({email,password:pw,options:{emailRedirectTo: new URL('owner.html',location.href).href}});
    if(error)throw error;
    if(data.session) location.replace('owner.html');
    else notice('Email Verification Link পাঠানো হয়েছে। Email Verify করে Login করো।','success');
   } else {
    const {error}=await client.auth.signInWithPassword({email,password:pw});if(error)throw error;
    location.replace('owner.html');
   }
  }catch(err){notice(err.message||'Login failed','error');}
  finally {submit.disabled=false;}
 };
})();

'use strict';
(async () => {
 const $ = id => document.getElementById(id);
 const { client,ready,notice,money } = window.sd;
 const token = new URLSearchParams(location.search).get('t') || '';
 const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 let menu=[],cart=new Map(),currentCategory='All',enabled=false,busy=false,requestId=null,restaurantId='';
 const discountPrice=i=>Math.round((Number(i.price)*(100-Number(i.discount_pct))/100)*100)/100;
 const count=()=>Array.from(cart.values()).reduce((a,b)=>a+b,0);
 const total=()=>menu.reduce((a,i)=>a+(cart.get(i.id)||0)*discountPrice(i),0);
 function render(){
   const cats=['All',...new Set(menu.map(x=>x.category||'Other'))];
   $('categories').replaceChildren();
   cats.forEach(category=>{
     const b=document.createElement('button');b.className='chip'+(currentCategory===category?' active':'');
     b.type='button';b.textContent=category;b.onclick=()=>{currentCategory=category;render();};$('categories').append(b);
   });
   const list=$('food-list');list.replaceChildren();
   const visible=menu.filter(i=>currentCategory==='All'||(i.category||'Other')===currentCategory);
   for(const item of visible){
     const outer=document.createElement('article');outer.className='food';
     let pict=document.createElement('div');pict.className='food-emoji';pict.textContent=emoji(item.category);
     if(item.image_path && restaurantId && item.image_path.startsWith(restaurantId+'/')){
       const publicImage=client.storage.from('smartdine-menu').getPublicUrl(item.image_path).data.publicUrl;
       if(publicImage){
         const fallback=pict;
         const image=document.createElement('img');image.className='sd-customer-photo';image.src=publicImage;
         image.alt=item.name;image.loading='lazy';image.decoding='async';
         image.onerror=()=>{image.replaceWith(fallback);};
         pict=image;
       }
     }
     const info=document.createElement('div');info.className='food-info';
     const name=document.createElement('h3');name.textContent=item.name;
     const category=document.createElement('div');category.className='muted small';category.textContent=item.category;
     const price=document.createElement('div');price.className='price';price.textContent=money(discountPrice(item));
     info.append(name,category);
     if(item.description){const desc=document.createElement('p');desc.className='sd-customer-desc';desc.textContent=item.description;info.append(desc);}
     info.append(price);
     if(Number(item.discount_pct)>0){const old=document.createElement('div');old.className='old';old.textContent=money(item.price)+' • '+item.discount_pct+'% OFF';info.append(old);}
     const btn=document.createElement('button');btn.className='btn primary';btn.type='button';btn.textContent='Add +';btn.disabled=!enabled;
     btn.onclick=()=>{cart.set(item.id,Math.min(10,(cart.get(item.id)||0)+1));requestId=null;renderCart();};info.append(btn);outer.append(pict,info);list.append(outer);
   }
   if(!visible.length){const p=document.createElement('p');p.className='muted';p.textContent='এই Category-তে কোনো খাবার নেই।';list.append(p);}
   $('item-count').textContent=menu.length+' foods';renderCart();
 }
 function emoji(category){const c=String(category).toLowerCase();return /pizza/.test(c)?'🍕':/burger/.test(c)?'🍔':/rice|biryani/.test(c)?'🍛':/drink|coffee|tea/.test(c)?'🥤':/dessert|sweet/.test(c)?'🍰':'🍽️';}
 function renderCart(){
   const n=count();$('cart-count').textContent=n+' items';$('bar-total').textContent=money(total());
   $('cartbar').hidden=!n||!enabled||!$('cart-panel').hidden;
   $('cart-items').replaceChildren();
   for(const [id,qty] of cart){const item=menu.find(i=>i.id===id);if(!item)continue;
     const line=document.createElement('div');line.className='cart-line';
     const detail=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.name;const p=document.createElement('div');p.className='muted small';p.textContent=money(discountPrice(item))+' each';detail.append(strong,p);
     const buttons=document.createElement('div');buttons.className='qty';
     const less=document.createElement('button');less.textContent='−';less.title='Remove one';less.onclick=()=>setQty(id,qty-1);
     const number=document.createElement('span');number.textContent=qty;
     const more=document.createElement('button');more.textContent='+';more.title='Add one';more.disabled=qty>=10;more.onclick=()=>setQty(id,qty+1);
     buttons.append(less,number,more);line.append(detail,buttons);$('cart-items').append(line);
   }
   $('cart-total').textContent=money(total());$('place-order').disabled=busy||!n||!enabled;
 }
 function setQty(id,qty){if(qty<=0)cart.delete(id);else cart.set(id,Math.min(10,qty));requestId=null;renderCart();}
 $('view-cart').onclick=()=>{$('cart-panel').hidden=false;$('cartbar').hidden=true;$('cart-panel').scrollIntoView({behavior:'smooth'});};
 $('new-order').onclick=()=>{$('confirmation').hidden=true;$('catalog').hidden=false;$('cart-panel').hidden=true;window.scrollTo({top:0,behavior:'smooth'});render();};
 $('place-order').onclick=async()=>{
   if(busy||!enabled||!count())return;
   busy=true;renderCart();$('place-order').textContent='Submitting…';
   try{
     requestId ||= crypto.randomUUID();
     const items=Array.from(cart.entries()).map(([id,quantity])=>({id,quantity}));
     const {data,error}=await client.rpc('smartdine_submit_order',{p_token:token,p_items:items,p_request_id:requestId});
     if(error)throw error;
     cart=new Map();requestId=null;$('catalog').hidden=true;$('cart-panel').hidden=true;$('cartbar').hidden=true;
     $('order-id').textContent=String(data.order_id).slice(0,8).toUpperCase();
     $('order-total').textContent=money(data.total);$('confirmation').hidden=false;
     notice('Your order has been sent to the restaurant.','success');$('confirmation').scrollIntoView({behavior:'smooth'});
   }catch(err){notice('Order পাঠানো যায়নি: '+(err.message||'Unknown error'),'error');}
   finally{busy=false;$('place-order').textContent='Place Order';renderCart();}
 };
 if(!ready){notice('Database Connection নেই। Config পরীক্ষা করো।','error');return;}
 if(!uuidPattern.test(token)){notice('এই লিংকে বৈধ Table QR নেই। Restaurant Owner থেকে QR নিয়ে স্ক্যান করো।','warn');return;}
 notice('Menu লোড হচ্ছে…');
 const {data,error}=await client.rpc('smartdine_public_menu',{p_token:token});
 if(error){notice('Menu Loading Error: '+error.message,'error');return;}
 if(!data){notice('এই QR Code টি পাওয়া যায়নি অথবা বন্ধ করা হয়েছে।','error');return;}
 $('intro').hidden=false;$('restaurant-name').textContent=data.name;$('restaurant-tagline').textContent=data.tagline||'Order from your table';
 $('table-number').textContent='Table '+data.table_number;
 restaurantId=String(data.restaurant_id||'');
 enabled=!!data.ordering_enabled;
 menu=Array.isArray(data.items)?data.items:[];
 $('catalog').hidden=false;
 if(enabled){$('message').hidden=true;}else{notice('Restaurant-এর Ordering আপাতত বন্ধ। Menu দেখা যাবে, কিন্তু অর্ডার দেওয়া যাবে না।','warn');}
 render();
})();

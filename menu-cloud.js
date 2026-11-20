/* SmartDine QR | Menu Cloud Photos
 * This add-on intentionally leaves the existing owner.js intact.
 * All durable restaurant/menu data is stored by Supabase, never localStorage.
 */
'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const sd = window.sd;
  const form=$('menu-form'), list=$('menu-list'), photoInput=$('sd-food-photo');
  if(!sd?.ready || !form || !list || !photoInput)return;

  let restaurant=null, images=new Map(), editingImage=null;
  let clearImage=false, isSaving=false, previewObject=null;
  const bucket='smartdine-menu';
  const imageTypes=new Set(['image/jpeg','image/png','image/webp']);
  const maxOriginalSize=15*1024*1024, maxUploadedSize=2*1024*1024;

  function notify(text,level='success') {sd.notice(text,level);}
  function isWritable(){return restaurant && sd.activeSubscription(restaurant);}
  function safeUrl(path){
    if(!restaurant || typeof path!=='string' || !path.startsWith(restaurant.id+'/'))return '';
    return sd.client.storage.from(bucket).getPublicUrl(path).data?.publicUrl||'';
  }
  function releasePreview(){if(previewObject){URL.revokeObjectURL(previewObject);previewObject=null;}}
  function showPreview(path='',file=null){
    releasePreview();
    const img=$('sd-photo-preview'),remove=$('sd-remove-photo');
    const url=file?(previewObject=URL.createObjectURL(file)):safeUrl(path);
    if(url){img.src=url;img.hidden=false;remove.hidden=false;}
    else{img.removeAttribute('src');img.hidden=true;remove.hidden=true;}
  }
  function resetPhoto(){
    photoInput.value='';editingImage=null;clearImage=false;showPreview();
    $('food-description').value='';
  }
  function attachThumbnails(){
    if(!restaurant)return;
    for(const card of list.querySelectorAll('.item-card')){
      const id=card.querySelector('[data-edit]')?.dataset.edit;
      if(!id)continue;
      const record=images.get(id),url=safeUrl(record?.image_path);
      let img=card.querySelector('img.sd-owner-food-image');
      if(url && !img){
        img=document.createElement('img');img.className='sd-owner-food-image';
        img.loading='lazy';img.decoding='async';img.alt='Food photo';
        img.onerror=()=>{img.hidden=true;};card.prepend(img);
      }
      if(img){if(url){if(img.src!==url)img.src=url;img.hidden=false;}else img.remove();}
    }
  }
  const menuObserver=new MutationObserver(() => attachThumbnails());
  menuObserver.observe(list,{childList:true,subtree:false});

  async function loadPhotoMetadata(){
    const {data,error}=await sd.client.from('menu_items')
      .select('id,image_path,description').eq('restaurant_id',restaurant.id);
    if(error){
      notify('Food Photo সেটআপের SQL আগে Run করতে হবে: '+error.message,'warn');
      return false;
    }
    images=new Map((data||[]).map(row=>[row.id,row]));
    attachThumbnails();
    return true;
  }
  function selectFood(id){
    const row=images.get(id);
    editingImage=row?.image_path||null;clearImage=false;
    photoInput.value='';
    $('food-description').value=row?.description||'';
    showPreview(editingImage);
  }
  // Existing owner.js edits the text fields; this add-on fills the photo/description.
  document.addEventListener('click', e=>{
    const edit=e.target.closest('#menu-list [data-edit]');
    if(edit){selectFood(edit.dataset.edit);return;}
    const remove=e.target.closest('#menu-list [data-remove]');
    if(remove){
      e.preventDefault();e.stopImmediatePropagation();
      void removeFood(remove.dataset.remove);
    }
  },true);
  $('cancel-edit')?.addEventListener('click',resetPhoto);
  $('sd-remove-photo')?.addEventListener('click',()=>{
    clearImage=true;photoInput.value='';showPreview();
  });
  photoInput.addEventListener('change',()=>{
    const file=photoInput.files?.[0];
    if(!file){showPreview(clearImage?'':editingImage);return;}
    if(!imageTypes.has(file.type)||file.size>maxOriginalSize){
      notify('JPG, PNG বা WebP ছবি দাও (মূল ছবি সর্বোচ্চ 15 MB)।','warn');
      photoInput.value='';showPreview(clearImage?'':editingImage);return;
    }
    clearImage=false;showPreview('',file);
  });

  async function optimizeImage(file){
    const blobUrl=URL.createObjectURL(file);
    let img;
    try {
      img=await new Promise((resolve,reject)=>{
        const element=new Image();element.onload=()=>resolve(element);
        element.onerror=()=>reject(new Error('ছবিটি পড়া যাচ্ছে না। JPG/PNG ব্যবহার করো।'));
        element.src=blobUrl;
      });
    }finally{URL.revokeObjectURL(blobUrl);}
    const canvas=document.createElement('canvas');
    let scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
    if(!Number.isFinite(scale)||scale<=0)throw new Error('Image dimensions invalid');
    let result;
    for(const [maxSide,quality] of [[1200,.8],[1000,.66],[800,.56]]){
      scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Cannot resize image');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(result && result.size<=maxUploadedSize)break;
    }
    if(!result||result.size>maxUploadedSize)throw new Error('Image is still over 2 MB after compression');
    return result;
  }

  async function uploadPhoto(file){
    const blob=await optimizeImage(file);
    const path=restaurant.id+'/'+crypto.randomUUID()+'.jpg';
    const {error}=await sd.client.storage.from(bucket).upload(path,blob,{
      contentType:'image/jpeg',upsert:false,cacheControl:'3600'
    });
    if(error)throw new Error('Photo upload failed: '+error.message);
    return path;
  }
  async function deleteCloudPhoto(path){
    if(!safeUrl(path))return;
    const {error}=await sd.client.storage.from(bucket).remove([path]);
    if(error)notify('পুরোনো ছবি পরিষ্কার করা যায়নি; Storage চেক করো।','warn');
  }

  async function removeFood(id){
    if(!restaurant||!isWritable()){notify('Active Trial / Subscription needed','warn');return;}
    if(!window.confirm('এই খাবারটি Menu থেকে মুছে ফেলবে?'))return;
    const row=images.get(id);
    const {error}=await sd.client.from('menu_items').delete().eq('id',id).eq('restaurant_id',restaurant.id);
    if(error){notify('Food delete failed: '+error.message,'error');return;}
    if(row?.image_path)await deleteCloudPhoto(row.image_path);
    location.hash='menu';location.reload();
  }

  // Use capture to prevent the older owner.js form handler from saving without photo.
  document.addEventListener('submit',event=>{
    if(event.target!==form)return;
    event.preventDefault();event.stopImmediatePropagation();
    void saveFood();
  },true);

  async function saveFood(){
    if(isSaving)return;
    if(!restaurant||!isWritable()){notify('Trial / Subscription expired','warn');return;}
    if(!form.reportValidity())return;
    const obj={
      name:$('food-name').value.trim(), category:$('food-category').value.trim(),
      description:$('food-description').value.trim(),
      price:Number($('food-price').value),cost:Number($('food-cost').value),
      discount_pct:Number($('food-discount').value),
      is_available:$('food-available').value==='true'
    };
    if(!obj.name||!obj.category||obj.description.length>300||!(obj.price>0)||!Number.isFinite(obj.cost)||obj.cost<0||obj.discount_pct<0||obj.discount_pct>100){
      notify('Food details সঠিকভাবে পূরণ করো।','warn');return;
    }
    const id=$('food-id').value;
    const oldPath=id?(images.get(id)?.image_path||null):null;
    let nextPath=clearImage?null:oldPath, uploadedPath=null;
    const file=photoInput.files?.[0];
    const button=$('save-food');isSaving=true;button.disabled=true;
    button.textContent='Saving to cloud…';
    try{
      if(file){
        if(!imageTypes.has(file.type)||file.size>maxOriginalSize)throw new Error('Unsupported image file');
        uploadedPath=await uploadPhoto(file);nextPath=uploadedPath;
      }
      obj.image_path=nextPath;
      let query;
      if(id)query=sd.client.from('menu_items').update(obj).eq('id',id).eq('restaurant_id',restaurant.id);
      else query=sd.client.from('menu_items').insert({...obj,restaurant_id:restaurant.id});
      const {error}=await query;
      if(error)throw error;
      if(oldPath && nextPath!==oldPath)await deleteCloudPhoto(oldPath);
      notify('Food, description ও photo Cloud-এ Save হয়েছে।','success');
      location.hash='menu';location.reload();
    }catch(error){
      if(uploadedPath)await deleteCloudPhoto(uploadedPath);
      notify('Save failed: '+(error.message||error),'error');
      button.disabled=false;button.textContent=id?'Update food':'Save food';
    }finally{isSaving=false;}
  }

  // Credentials remain in the existing, public Supabase publishable configuration;
  // the browser never receives a service role key.
  const {data:auth}=await sd.client.auth.getUser();
  if(!auth?.user)return;
  async function initializeMenuCloud(){
    const {data:r,error}=await sd.client.from('restaurants')
      .select('id,owner_id,trial_ends_at,paid_until,plan')
      .eq('owner_id',auth.user.id).maybeSingle();
    if(error||!r)return false;
    restaurant=r;
    await loadPhotoMetadata();
    return true;
  }
  const loaded=await initializeMenuCloud();
  if(!loaded){
    const portalRoot=$('portal');
    if(portalRoot){
      const observer=new MutationObserver(async()=>{
        if(portalRoot.hidden)return;
        observer.disconnect();
        await initializeMenuCloud();
      });
      observer.observe(portalRoot,{attributes:true,attributeFilter:['hidden']});
    }
  }
})();

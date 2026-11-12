/* ACS 9.0 — cosmetic catalog, purchases and equip UI */
(() => {
  "use strict";
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const notify=m=>typeof toast==="function"?toast(m):alert(m);
  const palettes=[
    ["solid_crimson","Vermelho Rubi"],["solid_azure","Azul Elétrico"],["solid_emerald","Verde Esmeralda"],["solid_violet","Violeta"],["solid_gold","Dourado"],
    ["gradient_sunset","Pôr do Sol"],["gradient_ocean","Oceano"],["gradient_aurora","Aurora Boreal"],["gradient_inferno","Inferno"],["gradient_candy","Candy"],["gradient_galaxy","Galáxia"],["gradient_royal","Realeza"],["gradient_sunrise","Amanhecer"],["gradient_arctic","Ártico"],["gradient_jungle","Selva"],
    ["animated_chroma","Chroma Flow"],["animated_neon","Neon Pulse"]
  ];
  const slots=[
    {key:"name",label:"Cor do nome",prices:{solid:100,gradient:600,animated:1600},column:{player:"profile_name_style",team:"name_style"}},
    {key:"frame",label:"Moldura",prices:{solid:150,gradient:900,animated:2000},column:{player:"profile_frame_style",team:"frame_style"}},
    {key:"background",label:"Cor do fundo",prices:{solid:200,gradient:1500,animated:2800},column:{player:"profile_background_style",team:"background_style"}}
  ];
  const classFor=key=>{
    if(!key||key==="default")return "";
    const parts=String(key).split("_");
    if(parts.length<3)return "";
    const slot=parts.shift();
    return "cosmetic-"+(slot==="background"?"background":slot)+"-"+parts.join("-");
  };
  const styleField=(scope,slot)=>slots.find(s=>s.key===slot).column[scope];
  const activeState={};
  async function renderEditor(scope,ownerId,host){
    if(!host||!window.supabaseClient){if(host)host.innerHTML='<p class="form-note">Entre na conta para acessar a loja de personalizações.</p>';return;}
    host.innerHTML='<p class="form-note">Carregando loja de personalizações...</p>';
    const [unlockRes,walletRes,ownerRes]=await Promise.all([
      supabaseClient.from("acs_cosmetic_unlocks").select("item_key").eq("scope",scope).eq("owner_id",ownerId),
      scope==="player"?supabaseClient.from("player_wallets").select("balance").eq("player_id",ownerId).maybeSingle():supabaseClient.from("team_economy_accounts").select("salary_balance").eq("team_id",ownerId).maybeSingle(),
      scope==="player"?supabaseClient.from("players").select("profile_name_style,profile_frame_style,profile_background_style").eq("id",ownerId).maybeSingle():supabaseClient.from("teams").select("name_style,frame_style,background_style").eq("id",ownerId).maybeSingle()
    ]);
    if(unlockRes.error){host.innerHTML='<p class="form-note">Não foi possível carregar os itens: '+esc(unlockRes.error.message)+'</p>';return;}
    if(walletRes.error){host.innerHTML='<p class="form-note">Não foi possível consultar o saldo. '+esc(walletRes.error.message)+'</p>';return;}
    const owned=new Set((unlockRes.data||[]).map(x=>x.item_key));
    const balance=Number(scope==="player"?walletRes.data?.balance||0:walletRes.data?.salary_balance||0);
    const current=ownerRes.data||{};
    activeState[scope+":"+ownerId]={owned,balance,current};
    const groups=slots.map(slot=>{
      const active=current[styleField(scope,slot.key)]||"default";
      const items=palettes.map(([suffix,label])=>{
        const key=slot.key+"_"+suffix,tier=suffix.split("_")[0],price=slot.prices[tier],isOwned=owned.has(key),isActive=active===key;
        return '<article class="cosmetic-item '+(isActive?"cosmetic-current":"")+'"><div class="cosmetic-swatch '+classFor(key)+'"></div><b>'+esc(label)+'</b><small>'+({solid:"Monocromático",gradient:"Degradê",animated:"Animado"}[tier])+' · $'+price.toLocaleString("pt-BR")+'</small><button type="button" class="btn '+(isActive?"btn-ghost":"btn-primary")+'" data-cosmetic-item="'+key+'" data-cosmetic-scope="'+scope+'" data-cosmetic-owner="'+ownerId+'" '+(isActive?"disabled":"")+'>'+(isActive?"Equipado":isOwned?"Equipar":"Comprar · $"+price.toLocaleString("pt-BR"))+'</button></article>';
      }).join("");
      return '<details class="cosmetic-shop-group" '+(slot.key==="name"?"open":"")+'><summary>'+slot.label.toUpperCase()+' · PADRÃO GRATUITO / '+palettes.length+' ITENS</summary><div class="cosmetic-shop-items"><article class="cosmetic-item '+(active==="default"?"cosmetic-current":"")+'"><div class="cosmetic-swatch" style="background:linear-gradient(135deg,#202b3a,#101722)"></div><b>Padrão</b><small>Personalização original</small><button type="button" class="btn btn-ghost" data-cosmetic-reset="'+slot.key+'" data-cosmetic-scope="'+scope+'" data-cosmetic-owner="'+ownerId+'" '+(active==="default"?"disabled":"")+'>Restaurar padrão</button></article>'+items+'</div></details>';
    }).join("");
    host.innerHTML='<div class="cosmetic-shop-head"><strong>LOJA DE PERSONALIZAÇÃO</strong><span class="cosmetic-shop-balance">'+(scope==="player"?"Sua carteira":"Caixa da equipe")+': $'+balance.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+'</span></div><p class="form-note">Cada item é comprado uma vez. Depois, você pode equipá-lo ou trocar entre os itens desbloqueados sem pagar novamente.</p>'+groups;
    host.querySelectorAll("[data-cosmetic-item]").forEach(btn=>btn.addEventListener("click",async()=>{
      btn.disabled=true;
      const {error}=await supabaseClient.rpc("acs_purchase_cosmetic",{p_scope:scope,p_team_id:scope==="team"?ownerId:null,p_item_key:btn.dataset.cosmeticItem});
      if(error){notify("Não foi possível aplicar a personalização: "+error.message);btn.disabled=false;return;}
      notify("Personalização equipada.");
      if(scope==="player"){await loadCloudPlayers();if(typeof openDetail==="function")openDetail(ownerId);}
      else if(typeof loadTeamsData==="function")await loadTeamsData();
      await renderEditor(scope,ownerId,host);
    }));
    host.querySelectorAll("[data-cosmetic-reset]").forEach(btn=>btn.addEventListener("click",async()=>{
      const slot=btn.dataset.cosmeticReset,table=scope==="player"?"players":"teams",field=styleField(scope,slot),payload={[field]:"default"};
      btn.disabled=true;
      const {error}=await supabaseClient.from(table).update(payload).eq("id",ownerId);
      if(error){notify("Não foi possível restaurar o padrão: "+error.message);btn.disabled=false;return;}
      notify("Personalização padrão restaurada.");
      if(scope==="player"){await loadCloudPlayers();if(typeof openDetail==="function")openDetail(ownerId);}
      else if(typeof loadTeamsData==="function")await loadTeamsData();
      await renderEditor(scope,ownerId,host);
    }));
  }
  function ensureModal(){
    if($("#cosmeticModal"))return;
    document.body.insertAdjacentHTML("beforeend",'<div class="modal-backdrop" id="cosmeticModal"><div class="modal cosmetic-modal"><div class="modal-head"><div><span class="eyebrow">PLAYER CUSTOMIZATION / ACS</span><h2>PERSONALIZAR PERFIL</h2></div><button class="icon-button" id="closeCosmeticModal">×</button></div><div id="playerCosmeticShop" class="cosmetic-shop-host"></div></div></div>');
    $("#closeCosmeticModal").addEventListener("click",()=>$("#cosmeticModal").classList.remove("open"));
    $("#cosmeticModal").addEventListener("click",e=>{if(e.target.id==="cosmeticModal")$("#cosmeticModal").classList.remove("open");});
  }
  document.addEventListener("click",e=>{
    if(e.target.closest("#customizePlayer")){
      const p=typeof currentPlayerProfile==="function"?currentPlayerProfile():null;
      if(!p){notify("Crie seu perfil de jogador antes de personalizar.");return;}
      ensureModal();$("#cosmeticModal").classList.add("open");renderEditor("player",p.id,$("#playerCosmeticShop"));
    }
  });
  window.ACS8Cosmetics={classFor,renderEditor};
})();
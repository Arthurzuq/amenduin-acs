/* ACS 10.1 — expanded achievements and automatic tournament MVPs */
(() => {
  "use strict";
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let careerObserver=null;
  function renderExtraAchievements(){
    const host=$("#acsCareer"),p=typeof currentPlayerProfile==="function"?currentPlayerProfile():null;
    if(!host||!p)return;
    careerObserver?.disconnect();
    $("#acsExtraAchievements")?.remove();
    const rows=[
      ["🛡️","Novato","Alcance 5 partidas.",Number(p.matches||0)>=5],
      ["🏟️","Lenda das partidas","Alcance 50 partidas.",Number(p.matches||0)>=50],
      ["☠️","Exterminador","Registre 500 eliminações.",Number(p.kills||0)>=500],
      ["🔥","Máquina de guerra","Registre 1.000 eliminações.",Number(p.kills||0)>=1000],
      ["⚡","Lenda da mira","Registre 2.500 eliminações.",Number(p.kills||0)>=2500],
      ["🥇","Colecionador de MVPs","Conquiste 10 MVPs.",Number(p.mvps||0)>=10],
      ["👑","Rei dos MVPs","Conquiste 25 MVPs.",Number(p.mvps||0)>=25],
      ["💎","MVP lendário","Conquiste 50 MVPs.",Number(p.mvps||0)>=50],
      ["🎯","Mira afiada","Alcance 50% de HS.",Number(p.hs||0)>=50],
      ["🧠","Precisão cirúrgica","Alcance 65% de HS.",Number(p.hs||0)>=65],
      ["📈","Imparável","Alcance K/D de 1,50.",Number(p.kd||0)>=1.5],
      ["💠","Intocável","Alcance K/D de 2,00.",Number(p.kd||0)>=2],
      ["🚀","Entrada explosiva","Registre 25 first kills.",Number(p.firstKills||0)>=25],
      ["⚔️","Dono do primeiro contato","Registre 100 first kills.",Number(p.firstKills||0)>=100],
      ["🧊","Clutch player","Vença 5 clutches.",Number(p.clutches||0)>=5],
      ["🐐","Clutch god","Vença 25 clutches.",Number(p.clutches||0)>=25],
      ["💥","Dano massivo","Alcance ADR médio de 90.",Number(p.adr||0)>=90],
      ["🏆","Alta performance","Alcance 60% de win rate em 10 partidas.",Number(p.win||0)>=60&&Number(p.matches||0)>=10],
      ["🌟","Lenda ACS","Alcance Rating AM de 90.",Number(p.rating||0)>=90]
    ];
    const unlocked=rows.filter(r=>r[3]).length;
    const section=document.createElement("section");section.id="acsExtraAchievements";section.className="detail-section";
    section.innerHTML='<h3>Conquistas adicionais <small>'+unlocked+'/'+rows.length+' desbloqueadas</small></h3><div class="achievement-grid">'+rows.map(r=>'<article class="achievement '+(r[3]?"":"locked")+'"><span>'+r[0]+'</span><b>'+esc(r[1])+'</b><small>'+esc(r[2])+'</small><small>'+(r[3]?"Desbloqueada":"Ainda não desbloqueada")+'</small></article>').join("")+'</div>';
    host.append(section);
    careerObserver?.observe(host,{childList:true});
  }
  async function loadTournamentMvps(){
    const host=$("#acsTournamentMvp");if(!host)return;
    const client=typeof supabaseClient!=="undefined"?supabaseClient:null;
    if(!client){host.innerHTML='<div class="community-empty">Conecte-se para consultar os MVPs dos campeonatos.</div>';return;}
    const {data,error}=await client.from("matches")
      .select("id,tournament_id,played_at,tournaments(name),player_match_stats(player_id,player_name_snapshot,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won,players(nickname))")
      .eq("status","completed").not("tournament_id","is",null).order("played_at",{ascending:false}).limit(2000);
    if(error){host.innerHTML='<div class="community-empty">Falha ao calcular MVPs: '+esc(error.message)+'</div>';return;}
    const tournaments=new Map();
    (data||[]).forEach(match=>{
      const id=match.tournament_id;if(!id)return;
      const t=match.tournaments||{};
      if(!tournaments.has(id))tournaments.set(id,{name:t.name||"Campeonato",matches:0,players:new Map()});
      const entry=tournaments.get(id);entry.matches++;
      (match.player_match_stats||[]).forEach(r=>{
        const key=r.player_id||("guest:"+String(r.player_name_snapshot||"Convidado"));
        if(!entry.players.has(key))entry.players.set(key,{name:r.players?.nickname||r.player_name_snapshot||"Convidado",matches:0,kills:0,deaths:0,assists:0,adr:0,adrN:0,hs:0,hsN:0,clutches:0,score:0});
        const p=entry.players.get(key),k=Number(r.kills||0),d=Number(r.deaths||0),a=Number(r.assists||0),adr=Number(r.adr||0),hs=Number(r.headshot_pct||0),cl=Number(r.clutches_won||0),fk=Number(r.first_kills||0),fd=Number(r.first_deaths||0),mvp=Number(r.mvps||0);
        p.matches++;p.kills+=k;p.deaths+=d;p.assists+=a;p.clutches+=cl;
        if(r.adr!=null){p.adr+=adr;p.adrN++;}if(r.headshot_pct!=null){p.hs+=hs;p.hsN++;}
        p.score+=k+a*.35+adr*.12+hs*.08+cl*3+fk*1.5+mvp*.5-fd*.75-d*.25;
      });
    });
    const cards=[...tournaments.values()].map(t=>{
      const rank=[...t.players.values()].sort((a,b)=>b.score-a.score||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name));
      return {...t,winner:rank[0],second:rank[1]};
    }).filter(t=>t.winner);
    host.innerHTML=cards.length?cards.map(t=>'<article class="tournament-mvp-card"><div class="tournament-mvp-heading"><span>🏆 MVP DO CAMPEONATO</span><small>'+t.matches+' partidas analisadas</small></div><h4>'+esc(t.name)+'</h4><div class="tournament-mvp-winner"><b>🥇 '+esc(t.winner.name)+'</b><strong>'+t.winner.score.toFixed(1)+' pts</strong></div><div class="tournament-mvp-stats"><span>'+t.winner.kills+' K</span><span>'+t.winner.deaths+' D</span><span>'+t.winner.assists+' A</span><span>'+(t.winner.adrN?(t.winner.adr/t.winner.adrN).toFixed(1):"—")+' ADR</span><span>'+(t.winner.hsN?(t.winner.hs/t.winner.hsN).toFixed(1):"—")+'% HS</span><span>'+t.winner.clutches+' clutches</span></div>'+(t.second?'<small class="tournament-mvp-runner">2º '+esc(t.second.name)+' · '+t.second.score.toFixed(1)+' pts</small>':'')+'</article>').join(""):'<div class="community-empty">Ainda não há partidas concluídas vinculadas a campeonatos.</div>';
  }
  const career=$("#acsCareer");
  if(career&&typeof MutationObserver!=="undefined"){careerObserver=new MutationObserver(()=>renderExtraAchievements());careerObserver.observe(career,{childList:true});}
  const oldGo=window.go;
  if(typeof oldGo==="function")window.go=function(page){oldGo(page);if(page==="community"){setTimeout(renderExtraAchievements,0);loadTournamentMvps();}};
  $("#acsCommunityRefresh")?.addEventListener("click",()=>loadTournamentMvps());
  if($("#page-community")?.classList.contains("active")){renderExtraAchievements();loadTournamentMvps();}
  window.ACS10Awards={refresh:loadTournamentMvps};
})();
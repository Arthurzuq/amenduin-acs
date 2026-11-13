/* ACS 10.2 — MVP do campeonato usando apenas estatísticas já registradas */
(() => {
  "use strict";
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function loadTournamentMvps(){
    const host=$("#acsTournamentMvp");
    if(!host)return;
    const client=typeof supabaseClient!=="undefined"?supabaseClient:null;
    if(!client){host.innerHTML='<div class="community-empty">Conecte-se para consultar os MVPs dos campeonatos.</div>';return;}
    const {data,error}=await client.from("matches")
      .select("id,tournament_id,played_at,tournaments(name),player_match_stats(player_id,player_name_snapshot,kills,deaths,assists,adr,headshot_pct,mvps,players(nickname))")
      .eq("status","completed").not("tournament_id","is",null).order("played_at",{ascending:false}).limit(2000);
    if(error){host.innerHTML='<div class="community-empty">Falha ao calcular MVPs: '+esc(error.message)+'</div>';return;}
    const tournaments=new Map();
    (data||[]).forEach(match=>{
      const id=match.tournament_id;
      if(!id)return;
      const t=match.tournaments||{};
      if(!tournaments.has(id))tournaments.set(id,{name:t.name||"Campeonato",matches:0,players:new Map()});
      const entry=tournaments.get(id);
      entry.matches++;
      (match.player_match_stats||[]).forEach(r=>{
        const key=r.player_id||("guest:"+String(r.player_name_snapshot||"Convidado"));
        if(!entry.players.has(key))entry.players.set(key,{
          name:r.players?.nickname||r.player_name_snapshot||"Convidado",
          matches:0,kills:0,deaths:0,assists:0,adr:0,adrN:0,hs:0,hsN:0,mvps:0,score:0
        });
        const p=entry.players.get(key);
        const k=Number(r.kills||0),d=Number(r.deaths||0),a=Number(r.assists||0);
        const adr=Number(r.adr||0),hs=Number(r.headshot_pct||0),mvps=Number(r.mvps||0);
        p.matches++;
        p.kills+=k;p.deaths+=d;p.assists+=a;p.mvps+=mvps;
        if(r.adr!=null){p.adr+=adr;p.adrN++;}
        if(r.headshot_pct!=null){p.hs+=hs;p.hsN++;}
        p.score+=k+a*.35+adr*.12+hs*.08+mvps*.5-d*.25;
      });
    });
    const cards=[...tournaments.values()].map(t=>{
      const rank=[...t.players.values()].sort((a,b)=>
        b.score-a.score||b.kills-a.kills||
        (b.adr/Math.max(1,b.adrN))-(a.adr/Math.max(1,a.adrN))||
        b.assists-a.assists||a.deaths-b.deaths||a.name.localeCompare(b.name)
      );
      return {...t,winner:rank[0],second:rank[1]};
    }).filter(t=>t.winner);
    host.innerHTML=cards.length?cards.map(t=>
      '<article class="tournament-mvp-card">'+
        '<div class="tournament-mvp-heading"><span>🏆 MVP DO CAMPEONATO</span><small>'+t.matches+' partidas analisadas</small></div>'+
        '<h4>'+esc(t.name)+'</h4>'+
        '<div class="tournament-mvp-winner"><b>🥇 '+esc(t.winner.name)+'</b><strong>'+t.winner.score.toFixed(1)+' pts</strong></div>'+
        '<div class="tournament-mvp-stats">'+
          '<span>'+t.winner.kills+' K</span><span>'+t.winner.deaths+' D</span><span>'+t.winner.assists+' A</span>'+
          '<span>'+(t.winner.adrN?(t.winner.adr/t.winner.adrN).toFixed(1):"—")+' ADR</span>'+
          '<span>'+(t.winner.hsN?(t.winner.hs/t.winner.hsN).toFixed(1):"—")+'% HS</span>'+
          '<span>'+t.winner.mvps+' MVPs</span>'+
        '</div>'+
        (t.second?'<small class="tournament-mvp-runner">2º '+esc(t.second.name)+' · '+t.second.score.toFixed(1)+' pts</small>':'')+
      '</article>'
    ).join(""):'<div class="community-empty">Ainda não há partidas concluídas vinculadas a campeonatos.</div>';
  }
  const oldGo=window.go;
  if(typeof oldGo==="function")window.go=function(page){
    oldGo(page);
    if(page==="community")setTimeout(loadTournamentMvps,0);
  };
  $("#acsCommunityRefresh")?.addEventListener("click",loadTournamentMvps);
  if($("#page-community")?.classList.contains("active"))loadTournamentMvps();
  window.ACS10Awards={refresh:loadTournamentMvps};
})();

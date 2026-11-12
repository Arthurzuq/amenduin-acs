/* ACS 7.0 — player wallets, team payroll and tournament rewards. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const notify = m => typeof toast === "function" ? toast(m) : alert(m);
  const money = value => "$ "+Number(value||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const dateTime = value => value ? new Date(value).toLocaleString("pt-BR") : "—";
  const weekLabels = {
    weekly_grant:"Repasse semanal da equipe",
    salary_payment:"Pagamento de salário",
    tournament_prize:"Premiação de campeonato",
    player_transfer:"Transferência entre jogadores"
  };
  const prizeValues = {
    1:{E:400,D:750,C:1500,B:5000,A:10000,S:50000},
    2:{E:150,D:300,C:800,B:2700,A:5300,S:28500},
    3:{E:40,D:140,C:300,B:1400,A:3100,S:12800},
    4:{E:40,D:140,C:300,B:1400,A:3100,S:12800},
    5:{E:10,D:25,C:50,B:100,A:200,S:500}
  };
  let currentEconomyTeam = null;
  let approvedPrizeTeams = [];

  function txCard(row){
    const positive=row.direction==="credit";
    const title=weekLabels[row.transaction_type]||row.transaction_type;
    return '<article class="economy-transaction '+(positive?"is-credit":"is-debit")+'">'+
      '<div><b>'+esc(title)+'</b><small>'+esc(row.description||"Movimentação")+' · '+esc(dateTime(row.created_at))+'</small></div>'+
      '<strong>'+(positive?"+":"−")+money(row.amount)+'</strong></article>';
  }
  function renderTransactions(host,rows,empty){
    if(!host)return;
    host.innerHTML=rows?.length?rows.map(txCard).join(""):'<div class="market-empty">'+esc(empty||"Nenhuma movimentação registrada.")+'</div>';
  }
  function ownMembership(profile){
    return profile&&Array.isArray(teamMembers)?teamMembers.find(m=>m.player_id===profile.id)||null:null;
  }
  function setNotice(message){
    const host=$("#economyNotice");if(host)host.textContent=message;
  }

  async function loadPrizeTeams(){
    const tournamentId=$("#economyPrizeTournament")?.value;
    const select=$("#economyPrizeTeam");
    if(!select)return;
    approvedPrizeTeams=[];
    if(!tournamentId){
      select.innerHTML='<option value="">Selecione um campeonato...</option>';
      updatePrizePreview();return;
    }
    const {data,error}=await supabaseClient.from("tournament_registrations")
      .select("team_id,teams(id,name,tag)").eq("tournament_id",tournamentId).eq("status","approved");
    if(error){select.innerHTML='<option value="">Erro ao carregar equipes</option>';notify("Não foi possível carregar equipes aprovadas: "+error.message);return;}
    approvedPrizeTeams=(data||[]).map(r=>r.teams).filter(Boolean);
    select.innerHTML='<option value="">Selecione uma equipe...</option>'+approvedPrizeTeams.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+(t.tag?" · "+esc(t.tag):"")+'</option>').join("");
    updatePrizePreview();
  }
  async function loadPrizeManager(){
    const panel=$("#economyPrizeAdminPanel");
    if(panel)panel.style.display=isAdmin?"block":"none";
    if(!isAdmin||!supabaseClient)return;
    const select=$("#economyPrizeTournament");
    if(!select)return;
    const old=select.value;
    const {data,error}=await supabaseClient.from("tournaments").select("id,name,status").order("created_at",{ascending:false});
    if(error){select.innerHTML='<option value="">Erro ao carregar campeonatos</option>';return;}
    select.innerHTML='<option value="">Selecione um campeonato...</option>'+(data||[]).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
    if((data||[]).some(t=>t.id===old))select.value=old;
    await loadPrizeTeams();
    const {data:awards,error:awardError}=await supabaseClient.from("tournament_prize_awards")
      .select("id,placement,tier,amount,awarded_at,teams(name),tournaments(name)")
      .order("awarded_at",{ascending:false}).limit(25);
    if(awardError){$("#economyPrizeHistory").textContent="Não foi possível carregar as premiações: "+awardError.message;return;}
    $("#economyPrizeHistory").innerHTML=awards?.length?awards.map(a=>
      '<article class="economy-transaction is-credit"><div><b>'+esc(a.tournaments?.name||"Campeonato")+' · '+a.placement+'º lugar · Tier '+esc(a.tier)+'</b><small>'+esc(a.teams?.name||"Equipe")+' · '+esc(dateTime(a.awarded_at))+'</small></div><strong>+'+money(a.amount)+'</strong></article>'
    ).join(""):'<div class="market-empty">Nenhuma premiação distribuída.</div>';
  }
  function updatePrizePreview(){
    const placement=Number($("#economyPrizePlacement")?.value||1);
    const tier=$("#economyPrizeTier")?.value||"E";
    const amount=prizeValues[placement]?.[tier]||0;
    if($("#economyPrizePreview"))$("#economyPrizePreview").textContent=money(amount);
    const button=$("#economyAwardPrize");
    if(button)button.disabled=!$("#economyPrizeTournament")?.value||!$("#economyPrizeTeam")?.value;
  }

  async function loadEconomy(){
    if(!supabaseClient){setNotice("A conexão com o sistema financeiro ainda não está disponível.");return;}
    if(!currentUser){setNotice("Entre na sua conta para consultar a economia.");return;}
    if(typeof loadTeamsData==="function")await loadTeamsData();
    const own=currentPlayerProfile();
    if(!own){
      setNotice("Crie ou vincule seu perfil de jogador para receber salários e usar a carteira.");
      await loadPrizeManager();
      return;
    }

    setNotice("Carregando suas carteiras e movimentações...");
    const membership=ownMembership(own);
    const team=membership?cloudTeams.find(t=>t.id===membership.team_id)||null:null;
    const captain=!!(membership&&membership.role==="captain");
    const canManage=!!(captain||isAdmin&&team);
    currentEconomyTeam=team;

    // Weekly stipends are caught up on the first economy-page visit of each week.
    let grantWarning="";
    if(captain&&team){
      const grant=await supabaseClient.rpc("economy_claim_weekly_grant",{p_team_id:team.id});
      if(grant.error)grantWarning=" Não foi possível atualizar o repasse semanal: "+grant.error.message;
    }

    const walletRes=await supabaseClient.from("player_wallets").select("balance").eq("player_id",own.id).maybeSingle();
    if(walletRes.error){setNotice("Falha ao carregar sua carteira: "+walletRes.error.message);return;}
    $("#economyPersonalBalance").textContent=money(walletRes.data?.balance||0);

    const personalHistory=await supabaseClient.from("economy_transactions").select("*")
      .eq("wallet_type","player").eq("player_id",own.id).order("created_at",{ascending:false}).limit(30);
    if(personalHistory.error)renderTransactions($("#economyPersonalHistory"),[],personalHistory.error.message);
    else renderTransactions($("#economyPersonalHistory"),personalHistory.data);

    const transferSelect=$("#economyTransferRecipient");
    if(transferSelect){
      const keep=transferSelect.value;
      transferSelect.innerHTML='<option value="">Selecione um jogador...</option>'+players
        .filter(p=>p.id!==own.id).sort((a,b)=>a.nickname.localeCompare(b.nickname))
        .map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nickname)+'</option>').join("");
      if(players.some(p=>p.id===keep&&p.id!==own.id))transferSelect.value=keep;
    }

    const salaryPanel=$("#economySalaryPanel"),memberPanel=$("#economyMemberSalaryPanel");
    if(salaryPanel)salaryPanel.style.display=captain&&team?"block":"none";
    if(memberPanel)memberPanel.style.display=membership&&!captain?"block":"none";
    if($("#economyTeamBalanceCard"))$("#economyTeamBalanceCard").style.display=canManage?"block":"none";
    if($("#economyTeamHistoryPanel"))$("#economyTeamHistoryPanel").style.display=captain&&team?"block":"none";

    if(team&&membership){
      const contractRes=await supabaseClient.from("team_salary_contracts")
        .select("team_id,player_id,weekly_salary,active").eq("team_id",team.id).order("weekly_salary",{ascending:false});
      if(contractRes.error){if($("#economySalaryContracts"))$("#economySalaryContracts").textContent="Não foi possível carregar salários: "+contractRes.error.message;}
      else{
        const contracts=contractRes.data||[];
        if(captain){
          const memberProfiles=teamMembers.filter(m=>m.team_id===team.id).map(m=>players.find(p=>p.id===m.player_id)).filter(Boolean);
          const playerSelect=$("#economySalaryPlayer"),keep=playerSelect?.value||"";
          if(playerSelect){
            playerSelect.innerHTML='<option value="">Selecione um integrante...</option>'+memberProfiles.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nickname)+'</option>').join("");
            if(memberProfiles.some(p=>p.id===keep))playerSelect.value=keep;
          }
          $("#economySalaryContracts").innerHTML=memberProfiles.map(p=>{
            const contract=contracts.find(c=>c.player_id===p.id);
            return '<article class="economy-contract"><div><b>'+esc(p.nickname)+'</b><small>'+(contract?.active?"Contrato ativo":"Sem salário ativo")+'</small></div><strong>'+money(contract?.weekly_salary||0)+'/sem.</strong><button type="button" class="btn btn-ghost btn-small" data-edit-economy-salary="'+esc(p.id)+'" data-salary-value="'+(contract?.weekly_salary||0)+'">Editar</button></article>';
          }).join("")||'<div class="market-empty">Nenhum integrante encontrado no elenco.</div>';
          $$("[data-edit-economy-salary]").forEach(btn=>btn.addEventListener("click",()=>{
            $("#economySalaryPlayer").value=btn.dataset.editEconomySalary;
            $("#economySalaryAmount").value=btn.dataset.salaryValue;
          }));
          const account=await supabaseClient.from("team_economy_accounts").select("salary_balance").eq("team_id",team.id).maybeSingle();
          if(account.error){setNotice("Falha ao ler a tesouraria: "+account.error.message);return;}
          $("#economyTeamBalance").textContent=money(account.data?.salary_balance||0);
          $("#economyTeamRole").textContent="CAPITÃO";
          const teamHistory=await supabaseClient.from("economy_transactions").select("*")
            .eq("wallet_type","team").eq("team_id",team.id).order("created_at",{ascending:false}).limit(30);
          if(teamHistory.error)renderTransactions($("#economyTeamHistory"),[],teamHistory.error.message);
          else renderTransactions($("#economyTeamHistory"),teamHistory.data);
        }else{
          const ownContract=contracts.find(c=>c.player_id===own.id&&c.active);
          $("#economyOwnSalary").innerHTML=ownContract
            ?'<div class="economy-own-salary"><b>'+money(ownContract.weekly_salary)+'/semana</b><span>Salário definido pelo capitão de '+esc(team.name)+'.</span></div>'
            :'<div class="market-empty">Seu capitão ainda não definiu um salário para você.</div>';
        }
      }
    }else{
      if($("#economyOwnSalary"))$("#economyOwnSalary").innerHTML='<div class="market-empty">Você ainda não faz parte de uma equipe.</div>';
      if($("#economySalaryContracts"))$("#economySalaryContracts").innerHTML='<div class="market-empty">Crie ou entre em uma equipe para configurar salários.</div>';
    }

    if($("#economyTransferSubmit"))$("#economyTransferSubmit").disabled=Number(walletRes.data?.balance||0)<=0;
    if($("#economySaveSalary"))$("#economySaveSalary").disabled=!captain||!team;
    if($("#economyPayPayroll"))$("#economyPayPayroll").disabled=!captain||!team;
    if($("#economyClaimGrant"))$("#economyClaimGrant").disabled=!captain||!team;
    setNotice("Carteira atualizada."+grantWarning+(team?" Equipe: "+team.name+".":" Você ainda não está em uma equipe."));
    await loadPrizeManager();
  }

  $("#economyRefresh")?.addEventListener("click",loadEconomy);
  $("#economyClaimGrant")?.addEventListener("click",async()=>{
    if(!currentEconomyTeam)return;
    const {data,error}=await supabaseClient.rpc("economy_claim_weekly_grant",{p_team_id:currentEconomyTeam.id});
    if(error){notify("Não foi possível atualizar o repasse: "+error.message);return;}
    notify(data?.weeks_credited?("Repasse atualizado: "+money(data.credited_amount)+"."):"O repasse desta semana já foi contabilizado.");
    await loadEconomy();
  });
  $("#economySaveSalary")?.addEventListener("click",async()=>{
    if(!currentEconomyTeam)return;
    const playerId=$("#economySalaryPlayer").value,amount=Number($("#economySalaryAmount").value);
    if(!playerId||!Number.isFinite(amount)||amount<0){notify("Selecione um jogador e informe um salário semanal válido.");return;}
    const {error}=await supabaseClient.rpc("economy_set_player_salary",{
      p_team_id:currentEconomyTeam.id,p_player_id:playerId,p_weekly_salary:amount
    });
    if(error){notify("Não foi possível salvar o salário: "+error.message);return;}
    notify("Salário semanal atualizado.");await loadEconomy();
  });
  $("#economyPayPayroll")?.addEventListener("click",async()=>{
    if(!currentEconomyTeam)return;
    if(!confirm("Pagar todos os salários semanais definidos para esta equipe? A operação só pode ser realizada uma vez por semana."))return;
    const button=$("#economyPayPayroll");button.disabled=true;
    const {data,error}=await supabaseClient.rpc("economy_pay_team_payroll",{p_team_id:currentEconomyTeam.id});
    button.disabled=false;
    if(error){notify("Não foi possível pagar a folha: "+error.message);return;}
    notify("Folha paga: "+data.players_paid+" jogador(es), total "+money(data.total_paid)+".");
    await loadEconomy();
  });
  $("#economyTransferForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const recipient=$("#economyTransferRecipient").value,amount=Number($("#economyTransferAmount").value);
    const description=$("#economyTransferDescription").value.trim()||null;
    if(!recipient||!Number.isFinite(amount)||amount<=0){notify("Informe um destinatário e um valor válido.");return;}
    const button=$("#economyTransferSubmit");button.disabled=true;
    const {data,error}=await supabaseClient.rpc("economy_transfer_player_balance",{
      p_recipient_player_id:recipient,p_amount:amount,p_description:description
    });
    button.disabled=false;
    if(error){notify("Não foi possível enviar a transferência: "+error.message);return;}
    e.target.reset();notify("Transferência realizada: "+money(data.amount)+".");await loadEconomy();
  });

  $("#economyPrizeTournament")?.addEventListener("change",loadPrizeTeams);
  ["#economyPrizeTeam","#economyPrizePlacement","#economyPrizeTier"].forEach(selector=>
    $(selector)?.addEventListener("change",updatePrizePreview)
  );
  $("#economyAwardPrize")?.addEventListener("click",async()=>{
    const tournamentId=$("#economyPrizeTournament").value,teamId=$("#economyPrizeTeam").value;
    const placement=Number($("#economyPrizePlacement").value),tier=$("#economyPrizeTier").value;
    if(!tournamentId||!teamId){notify("Selecione campeonato e equipe.");return;}
    const amount=prizeValues[placement]?.[tier]||0;
    if(!confirm("Creditar "+money(amount)+" para "+(approvedPrizeTeams.find(t=>t.id===teamId)?.name||"a equipe")+" pelo "+placement+"º lugar?"))return;
    const button=$("#economyAwardPrize");button.disabled=true;
    const {error}=await supabaseClient.rpc("economy_award_tournament_prize",{
      p_tournament_id:tournamentId,p_team_id:teamId,p_placement:placement,p_tier:tier
    });
    button.disabled=false;
    if(error){notify("Não foi possível creditar a premiação: "+error.message);return;}
    notify("Premiação creditada na tesouraria da equipe.");await loadEconomy();
  });

  const previousGo=go;
  go=function(page){
    previousGo(page);
    if(page==="economy")loadEconomy();
  };
  // Make the economy page load correctly when opened directly after auth has settled.
  if($("#page-economy")?.classList.contains("active"))loadEconomy();
})();
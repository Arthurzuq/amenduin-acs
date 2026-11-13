/* ACS 10.0 — Economia reconstruída com snapshot autenticado do Supabase. */
(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
  const notify = message => typeof toast === "function" ? toast(message) : alert(message);
  const money = value => "$ " + Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const dateTime = value => value ? new Date(value).toLocaleString("pt-BR") : "—";
  const labels = {
    weekly_grant: "Repasse semanal da equipe",
    salary_payment: "Pagamento de salário",
    tournament_prize: "Premiação de campeonato",
    player_transfer: "Transferência entre jogadores",
    cosmetic_purchase: "Compra de personalização"
  };
  const prizeValues = {
    1: { E: 400, D: 750, C: 1500, B: 5000, A: 10000, S: 50000 },
    2: { E: 150, D: 300, C: 800, B: 2700, A: 5300, S: 28500 },
    3: { E: 40, D: 140, C: 300, B: 1400, A: 3100, S: 12800 },
    4: { E: 40, D: 140, C: 300, B: 1400, A: 3100, S: 12800 },
    5: { E: 10, D: 25, C: 50, B: 100, A: 200, S: 500 }
  };

  let snapshot = null;
  let currentEconomyTeam = null;
  let approvedPrizeTeams = [];
  let loadSequence = 0;
  let loading = false;

  function setNotice(message) {
    const host = $("#economyNotice");
    if (host) host.textContent = message;
  }

  function setVisible(selector, visible) {
    const host = $(selector);
    if (host) host.style.display = visible ? "block" : "none";
  }

  function setBalance(selector, value) {
    const host = $(selector);
    if (!host) return;
    host.textContent = value === null || value === undefined ? "—" : money(value);
  }

  function renderTransactions(host, rows, emptyMessage) {
    if (!host) return;
    if (!Array.isArray(rows) || !rows.length) {
      host.innerHTML = '<div class="market-empty">' + esc(emptyMessage || "Nenhuma movimentação registrada.") + "</div>";
      return;
    }
    host.innerHTML = rows.map(row => {
      const credit = row.direction === "credit";
      const title = labels[row.transaction_type] || row.transaction_type || "Movimentação";
      return '<article class="economy-transaction ' + (credit ? "is-credit" : "is-debit") + '">' +
        "<div><b>" + esc(title) + "</b><small>" + esc(row.description || "Movimentação") +
        " · " + esc(dateTime(row.created_at)) + "</small></div>" +
        "<strong>" + (credit ? "+" : "−") + money(row.amount) + "</strong></article>";
    }).join("");
  }

  function resetPrivateView(message) {
    snapshot = null;
    currentEconomyTeam = null;
    setBalance("#economyPersonalBalance", null);
    setBalance("#economyTeamBalance", null);
    setVisible("#economyTeamBalanceCard", false);
    setVisible("#economySalaryPanel", false);
    setVisible("#economyMemberSalaryPanel", false);
    setVisible("#economyTeamHistoryPanel", false);
    setNotice(message);
    renderTransactions($("#economyPersonalHistory"), [], "Entre na sua conta para consultar as movimentações.");
    renderTransactions($("#economyTeamHistory"), [], "Entre como capitão para consultar a tesouraria.");
  }

  function setButtonLoading(selector, busy, label) {
    const button = $(selector);
    if (!button) return;
    if (busy) {
      button.dataset.previousText = button.textContent;
      button.disabled = true;
      if (label) button.textContent = label;
    } else {
      button.disabled = false;
      if (button.dataset.previousText) {
        button.textContent = button.dataset.previousText;
        delete button.dataset.previousText;
      }
    }
  }

  async function getAuthenticatedSession() {
    if (!supabaseClient || !supabaseClient.auth) {
      return { user: null, error: new Error("A conexão com o Supabase não está configurada.") };
    }
    const result = await supabaseClient.auth.getSession();
    if (result.error) return { user: null, error: result.error };
    const user = result.data && result.data.session && result.data.session.user;
    return { user: user || null, error: null };
  }

  async function loadRecipientOptions(playerId) {
    const select = $("#economyTransferRecipient");
    if (!select || !supabaseClient) return;
    const previous = select.value;
    const { data, error } = await supabaseClient.from("players")
      .select("id,nickname")
      .neq("id", playerId)
      .order("nickname");
    if (error) {
      select.innerHTML = '<option value="">Não foi possível carregar jogadores</option>';
      console.warn("ACS economy recipients:", error.message);
      return;
    }
    const entries = data || [];
    select.innerHTML = '<option value="">Selecione um jogador...</option>' +
      entries.map(player => '<option value="' + esc(player.id) + '">' + esc(player.nickname) + "</option>").join("");
    if (entries.some(player => player.id === previous)) select.value = previous;
  }

  async function loadPrizeTeams() {
    const tournamentId = $("#economyPrizeTournament")?.value;
    const select = $("#economyPrizeTeam");
    if (!select) return;
    approvedPrizeTeams = [];
    if (!tournamentId) {
      select.innerHTML = '<option value="">Selecione um campeonato...</option>';
      updatePrizePreview();
      return;
    }
    const { data, error } = await supabaseClient.from("tournament_registrations")
      .select("team_id,teams(id,name,tag)")
      .eq("tournament_id", tournamentId)
      .eq("status", "approved");
    if (error) {
      select.innerHTML = '<option value="">Erro ao carregar equipes</option>';
      notify("Não foi possível carregar equipes aprovadas: " + error.message);
      return;
    }
    approvedPrizeTeams = (data || []).map(row => row.teams).filter(Boolean);
    select.innerHTML = '<option value="">Selecione uma equipe...</option>' +
      approvedPrizeTeams.map(team => '<option value="' + esc(team.id) + '">' +
        esc(team.name) + (team.tag ? " · " + esc(team.tag) : "") + "</option>").join("");
    updatePrizePreview();
  }

  async function loadPrizeManager(isAdmin) {
    const panel = $("#economyPrizeAdminPanel");
    if (panel) panel.style.display = isAdmin ? "block" : "none";
    if (!isAdmin || !supabaseClient) return;

    const select = $("#economyPrizeTournament");
    if (!select) return;
    const previous = select.value;
    const { data, error } = await supabaseClient.from("tournaments")
      .select("id,name,status")
      .order("created_at", { ascending: false });
    if (error) {
      select.innerHTML = '<option value="">Erro ao carregar campeonatos</option>';
      const history = $("#economyPrizeHistory");
      if (history) history.textContent = "Não foi possível carregar campeonatos: " + error.message;
      return;
    }
    const tournaments = data || [];
    select.innerHTML = '<option value="">Selecione um campeonato...</option>' +
      tournaments.map(tournament => '<option value="' + esc(tournament.id) + '">' +
        esc(tournament.name) + "</option>").join("");
    if (tournaments.some(tournament => tournament.id === previous)) select.value = previous;
    await loadPrizeTeams();

    const { data: awards, error: awardError } = await supabaseClient.from("tournament_prize_awards")
      .select("id,placement,tier,amount,awarded_at,teams(name),tournaments(name)")
      .order("awarded_at", { ascending: false })
      .limit(25);
    if (awardError) {
      $("#economyPrizeHistory").textContent = "Não foi possível carregar as premiações: " + awardError.message;
      return;
    }
    $("#economyPrizeHistory").innerHTML = awards?.length ? awards.map(award =>
      '<article class="economy-transaction is-credit"><div><b>' +
      esc(award.tournaments?.name || "Campeonato") + " · " + award.placement +
      "º lugar · Tier " + esc(award.tier) + "</b><small>" +
      esc(award.teams?.name || "Equipe") + " · " + esc(dateTime(award.awarded_at)) +
      "</small></div><strong>+" + money(award.amount) + "</strong></article>"
    ).join("") : '<div class="market-empty">Nenhuma premiação distribuída.</div>';
  }

  function updatePrizePreview() {
    const placement = Number($("#economyPrizePlacement")?.value || 1);
    const tier = $("#economyPrizeTier")?.value || "E";
    const amount = prizeValues[placement]?.[tier] || 0;
    const preview = $("#economyPrizePreview");
    if (preview) preview.textContent = money(amount);
    const button = $("#economyAwardPrize");
    if (button) button.disabled = !$("#economyPrizeTournament")?.value || !$("#economyPrizeTeam")?.value;
  }

  function renderTeam(snapshotTeam, ownPlayerId) {
    const team = snapshotTeam || null;
    currentEconomyTeam = team;
    const isCaptain = !!team && team.role === "captain";
    const canManage = !!team && team.can_manage === true;

    setVisible("#economyTeamBalanceCard", canManage);
    setVisible("#economySalaryPanel", isCaptain);
    setVisible("#economyMemberSalaryPanel", !!team && !isCaptain);
    setVisible("#economyTeamHistoryPanel", canManage);

    if (!team) {
      setBalance("#economyTeamBalance", null);
      if ($("#economyOwnSalary")) $("#economyOwnSalary").innerHTML =
        '<div class="market-empty">Você ainda não faz parte de uma equipe.</div>';
      if ($("#economySalaryContracts")) $("#economySalaryContracts").innerHTML =
        '<div class="market-empty">Crie ou entre em uma equipe para configurar salários.</div>';
      renderTransactions($("#economyTeamHistory"), [], "Você ainda não possui uma equipe.");
      return;
    }

    if (canManage) setBalance("#economyTeamBalance", team.treasury_balance);
    else setBalance("#economyTeamBalance", null);

    if ($("#economyTeamRole")) {
      $("#economyTeamRole").textContent = isCaptain ? "CAPITÃO" : "ADMINISTRADOR";
    }

    const members = Array.isArray(team.members) ? team.members : [];
    if (isCaptain) {
      const playerSelect = $("#economySalaryPlayer");
      const previous = playerSelect?.value || "";
      if (playerSelect) {
        playerSelect.innerHTML = '<option value="">Selecione um integrante...</option>' +
          members.map(member => '<option value="' + esc(member.player_id) + '">' +
            esc(member.nickname) + "</option>").join("");
        if (members.some(member => member.player_id === previous)) playerSelect.value = previous;
      }
      const contractsHost = $("#economySalaryContracts");
      if (contractsHost) {
        contractsHost.innerHTML = members.map(member =>
          '<article class="economy-contract"><div><b>' + esc(member.nickname) +
          "</b><small>" + (member.active ? "Contrato ativo" : "Sem salário ativo") +
          "</small></div><strong>" + money(member.weekly_salary) +
          '/sem.</strong><button type="button" class="btn btn-ghost btn-small" data-edit-economy-salary="' +
          esc(member.player_id) + '" data-salary-value="' + Number(member.weekly_salary || 0) +
          '">Editar</button></article>'
        ).join("") || '<div class="market-empty">Nenhum integrante encontrado no elenco.</div>';
        $$("[data-edit-economy-salary]").forEach(button => button.addEventListener("click", () => {
          $("#economySalaryPlayer").value = button.dataset.editEconomySalary;
          $("#economySalaryAmount").value = button.dataset.salaryValue;
        }));
      }
    } else if ($("#economyOwnSalary")) {
      const contract = team.own_contract;
      $("#economyOwnSalary").innerHTML = contract?.active
        ? '<div class="economy-own-salary"><b>' + money(contract.weekly_salary) +
          '/semana</b><span>Salário definido pelo capitão de ' + esc(team.name) + '.</span></div>'
        : '<div class="market-empty">Seu capitão ainda não definiu um salário para você.</div>';
    }

    if (canManage) renderTransactions($("#economyTeamHistory"), team.history);
    else renderTransactions($("#economyTeamHistory"), [], "Apenas o capitão ou administrador pode consultar a tesouraria.");
  }

  async function loadEconomy() {
    const sequence = ++loadSequence;
    if (!supabaseClient) {
      resetPrivateView("A conexão com o sistema financeiro não está disponível.");
      return;
    }
    if (loading) {
      // A newer request always wins; the previous response cannot overwrite it.
    }
    loading = true;
    setNotice("Verificando sessão e consultando as carteiras...");
    setBalance("#economyPersonalBalance", null);
    setBalance("#economyTeamBalance", null);

    try {
      const sessionResult = await getAuthenticatedSession();
      if (sequence !== loadSequence) return;
      if (sessionResult.error) {
        resetPrivateView("Não foi possível validar a sessão: " + sessionResult.error.message);
        return;
      }
      if (!sessionResult.user) {
        if (typeof currentUser !== "undefined") currentUser = null;
        if (typeof updateAuthButton === "function") updateAuthButton();
        resetPrivateView("Sua sessão não está ativa. Entre na conta para consultar a economia.");
        return;
      }

      if (typeof currentUser !== "undefined") currentUser = sessionResult.user;
      if (typeof updateAuthButton === "function") updateAuthButton();

      const { data, error } = await supabaseClient.rpc("economy_get_dashboard");
      if (sequence !== loadSequence) return;
      if (error) {
        resetPrivateView("O banco recusou a consulta da Economia: " + error.message);
        return;
      }
      if (!data || !data.player || !data.player.id) {
        resetPrivateView("A conta autenticada não possui um perfil de jogador vinculado.");
        return;
      }

      snapshot = data;
      setBalance("#economyPersonalBalance", data.player.wallet_balance);
      renderTransactions($("#economyPersonalHistory"), data.personal_history,
        "Nenhuma movimentação registrada na sua carteira.");
      renderTeam(data.team, data.player.id);

      const transferButton = $("#economyTransferSubmit");
      if (transferButton) transferButton.disabled = Number(data.player.wallet_balance || 0) <= 0;
      if ($("#economySaveSalary")) $("#economySaveSalary").disabled = !data.team || data.team.role !== "captain";
      if ($("#economyPayPayroll")) $("#economyPayPayroll").disabled = !data.team || data.team.role !== "captain";
      if ($("#economyClaimGrant")) $("#economyClaimGrant").disabled = !data.team || data.team.role !== "captain";

      // Catch up the weekly grant only for the actual captain; the RPC is idempotent.
      let grantWarning = "";
      if (data.team && data.team.role === "captain") {
        const grantResult = await supabaseClient.rpc("economy_claim_weekly_grant", {
          p_team_id: data.team.id
        });
        if (sequence !== loadSequence) return;
        if (grantResult.error) {
          grantWarning = " Não foi possível verificar o repasse semanal: " + grantResult.error.message;
        } else {
          const refreshed = await supabaseClient.rpc("economy_get_dashboard");
          if (sequence !== loadSequence) return;
          if (!refreshed.error && refreshed.data?.player) {
            snapshot = refreshed.data;
            setBalance("#economyPersonalBalance", refreshed.data.player.wallet_balance);
            renderTransactions($("#economyPersonalHistory"), refreshed.data.personal_history,
              "Nenhuma movimentação registrada na sua carteira.");
            renderTeam(refreshed.data.team, refreshed.data.player.id);
            data.is_admin = refreshed.data.is_admin;
          }
        }
      }

      await loadRecipientOptions(data.player.id);
      if (sequence !== loadSequence) return;
      await loadPrizeManager(!!snapshot?.is_admin);
      if (sequence !== loadSequence) return;

      const currentTeamName = snapshot?.team?.name;
      setNotice("Economia sincronizada com o banco de dados. " +
        (currentTeamName ? "Equipe: " + currentTeamName + "." : "Você ainda não está em uma equipe.") +
        grantWarning);
    } catch (error) {
      if (sequence === loadSequence) {
        resetPrivateView("Falha ao carregar a Economia: " + (error?.message || String(error)));
        console.error("ACS economy load:", error);
      }
    } finally {
      if (sequence === loadSequence) loading = false;
    }
  }

  async function refreshAfterMutation(message) {
    if (message) notify(message);
    await loadEconomy();
  }

  $("#economyRefresh")?.addEventListener("click", loadEconomy);

  $("#economyClaimGrant")?.addEventListener("click", async () => {
    const team = snapshot?.team;
    if (!team || team.role !== "captain") return notify("Somente o capitão pode atualizar o repasse.");
    setButtonLoading("#economyClaimGrant", true, "Atualizando...");
    const { data, error } = await supabaseClient.rpc("economy_claim_weekly_grant", { p_team_id: team.id });
    setButtonLoading("#economyClaimGrant", false);
    if (error) return notify("Não foi possível atualizar o repasse: " + error.message);
    await refreshAfterMutation(data?.weeks_credited
      ? "Repasse atualizado: " + money(data.credited_amount) + "."
      : "O repasse desta semana já foi contabilizado.");
  });

  $("#economySaveSalary")?.addEventListener("click", async () => {
    const team = snapshot?.team;
    if (!team || team.role !== "captain") return notify("Somente o capitão pode definir salários.");
    const playerId = $("#economySalaryPlayer")?.value;
    const amount = Number($("#economySalaryAmount")?.value);
    if (!playerId || !Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      return notify("Selecione um jogador e informe um salário semanal válido.");
    }
    setButtonLoading("#economySaveSalary", true, "Salvando...");
    const { error } = await supabaseClient.rpc("economy_set_player_salary", {
      p_team_id: team.id, p_player_id: playerId, p_weekly_salary: amount
    });
    setButtonLoading("#economySaveSalary", false);
    if (error) return notify("Não foi possível salvar o salário: " + error.message);
    await refreshAfterMutation("Salário semanal atualizado.");
  });

  $("#economyPayPayroll")?.addEventListener("click", async () => {
    const team = snapshot?.team;
    if (!team || team.role !== "captain") return notify("Somente o capitão pode pagar a folha.");
    if (!confirm("Pagar todos os salários semanais definidos para esta equipe? A operação só pode ser realizada uma vez por semana.")) return;
    setButtonLoading("#economyPayPayroll", true, "Processando...");
    const { data, error } = await supabaseClient.rpc("economy_pay_team_payroll", { p_team_id: team.id });
    setButtonLoading("#economyPayPayroll", false);
    if (error) return notify("Não foi possível pagar a folha: " + error.message);
    await refreshAfterMutation("Folha paga: " + data.players_paid + " jogador(es), total " + money(data.total_paid) + ".");
  });

  $("#economyTransferForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const recipientId = $("#economyTransferRecipient")?.value;
    const amount = Number($("#economyTransferAmount")?.value);
    const description = $("#economyTransferDescription")?.value.trim() || null;
    if (!recipientId || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return notify("Informe um destinatário e um valor válido.");
    }
    setButtonLoading("#economyTransferSubmit", true, "Enviando...");
    const { data, error } = await supabaseClient.rpc("economy_transfer_player_balance", {
      p_recipient_player_id: recipientId, p_amount: amount, p_description: description
    });
    setButtonLoading("#economyTransferSubmit", false);
    if (error) return notify("Não foi possível enviar a transferência: " + error.message);
    event.target.reset();
    await refreshAfterMutation("Transferência realizada: " + money(data.amount) + ".");
  });

  $("#economyPrizeTournament")?.addEventListener("change", loadPrizeTeams);
  ["#economyPrizeTeam", "#economyPrizePlacement", "#economyPrizeTier"].forEach(selector =>
    $(selector)?.addEventListener("change", updatePrizePreview)
  );

  $("#economyAwardPrize")?.addEventListener("click", async () => {
    const tournamentId = $("#economyPrizeTournament")?.value;
    const teamId = $("#economyPrizeTeam")?.value;
    const placement = Number($("#economyPrizePlacement")?.value);
    const tier = $("#economyPrizeTier")?.value;
    if (!snapshot?.is_admin) return notify("Somente administradores podem distribuir premiações.");
    if (!tournamentId || !teamId) return notify("Selecione campeonato e equipe.");
    const amount = prizeValues[placement]?.[tier] || 0;
    const teamName = approvedPrizeTeams.find(team => team.id === teamId)?.name || "a equipe";
    if (!confirm("Creditar " + money(amount) + " para " + teamName + " pelo " + placement + "º lugar?")) return;
    setButtonLoading("#economyAwardPrize", true, "Creditando...");
    const { error } = await supabaseClient.rpc("economy_award_tournament_prize", {
      p_tournament_id: tournamentId, p_team_id: teamId,
      p_placement: placement, p_tier: tier
    });
    setButtonLoading("#economyAwardPrize", false);
    if (error) return notify("Não foi possível creditar a premiação: " + error.message);
    await refreshAfterMutation("Premiação creditada na tesouraria da equipe.");
  });

  window.ACS7EconomyLoad = loadEconomy;

  if (typeof go === "function") {
    const previousGo = go;
    go = function (page) {
      previousGo(page);
      if (page === "economy") loadEconomy();
    };
  }
  if ($("#page-economy")?.classList.contains("active")) loadEconomy();
})();
/* ACS public tournament schedule — read-only view derived from the organizer's whiteboard. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const tournamentId = document.documentElement.dataset.acsTournamentId || "9a865495-77c1-439f-a468-0ad8d52634b7";
  const panel = $("#tournamentPublicSchedulePanel");
  const host = $("#tournamentPublicSchedule");
  if (!panel || !host) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const ordinal = (value) => {
    const number = Number(String(value || "").replace("place_", ""));
    return Number.isFinite(number) && number > 0 ? number + "º" : String(value || "");
  };
  const statusText = (status) => ({
    ready: "Pronta", completed: "Concluída", pending: "Aguardando equipes",
    live: "Em andamento", bye: "Avanço automático", cancelled: "Cancelada"
  })[status] || "Aguardando";
  let requestVersion = 0;

  function teamName(teamId, teams) {
    return teamId ? (teams.get(teamId)?.name || "Equipe inscrita") : "";
  }

  function nodeTitle(node, row, allMatchNodes) {
    if (node?.label && String(node.label).trim()) return String(node.label).trim();
    const index = allMatchNodes.findIndex((item) => item.id === node?.id) + 1;
    const number = row?.match_number || index || 1;
    return "Jogo " + String(number).padStart(2, "0");
  }

  function nodeForRow(rowId, nodes) {
    return nodes.find((node) => node.id === rowId || node.bracketId === rowId) || null;
  }

  function targetDescription(edge, nodes, rowsById, stagesById, allMatchNodes) {
    const target = nodes.find((node) => node.id === edge.to || node.bracketId === edge.to);
    if (!target) return "Destino não encontrado";
    if (target.type === "group") return (target.name || "Fase de grupos") + " · classificação";
    const targetRow = rowsById.get(target.bracketId || target.id);
    const stageName = targetRow?.bracket_side === "main" ? "Mata-mata" : (stagesById.get(targetRow?.stage_id) || "Mata-mata");
    const round = targetRow?.round_number ? " · Rodada " + targetRow.round_number : "";
    const match = nodeTitle(target, targetRow, allMatchNodes);
    return stageName + round + " · " + match + " · vaga " + edge.slot;
  }

  function sourceDescription(edge, nodes, rowsById, allMatchNodes) {
    const source = nodes.find((node) => node.id === edge.from || node.bracketId === edge.from);
    if (!source) return "resultado de outra fase";
    if (source.type === "group") return ordinal(edge.result) + " do " + (source.name || "grupo");
    const row = rowsById.get(source.bracketId || source.id);
    const round = row?.round_number ? " da Rodada " + row.round_number : "";
    return (edge.result === "loser" ? "Perdedor" : "Vencedor") + " de " + nodeTitle(source, row, allMatchNodes) + round;
  }

  function renderTable(board, rows, stages, registrations) {
    const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
    const edges = Array.isArray(board?.edges) ? board.edges : [];
    const matchNodes = nodes.filter((node) => node.type !== "group");
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    rows.forEach((row) => {
      if (row.config?.board_node_id) rowsById.set(row.config.board_node_id, row);
    });
    const stagesById = new Map(stages.map((stage) => [stage.id, stage.name]));
    const teams = new Map();
    registrations.forEach((registration) => {
      const team = registration.teams;
      if (team?.id) teams.set(team.id, team);
    });
    const teamFromId = (id) => teamName(id, teams);
    const rowForNode = (node) => rowsById.get(node.bracketId || node.id) || rows.find((row) => row.config?.board_node_id === node.id) || null;
    const incomingFor = (nodeId, slot) => edges.find((edge) => edge.to === nodeId && edge.slot === slot) || null;
    const outgoingFor = (nodeId, result) => edges.find((edge) => edge.from === nodeId && edge.result === result) || null;
    const matchLabels = new Map();
    nodes.filter((node) => node.type === "group").forEach((group) => {
      (group.fixtures || []).forEach((fixture, index) => {
        const id = fixture.bracketId || fixture.id;
        if (id) matchLabels.set(id, (group.name || "Grupo") + " · R" + Number(fixture.round || 1) + " · J" + (index + 1));
      });
    });
    matchNodes.forEach((node) => {
      const row = rowForNode(node);
      const label = nodeTitle(node, row, matchNodes);
      matchLabels.set(node.id, label);
      if (node.bracketId) matchLabels.set(node.bracketId, label);
    });
    const scheduleSummary = (schedule) => {
      if (schedule?.mode === "fixed") {
        if (!schedule.startsAt) return "Data e horário a definir";
        const date = new Date(schedule.startsAt);
        return Number.isNaN(date.getTime())
          ? "Data e horário inválidos"
          : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      }
      if (schedule?.mode === "after") {
        if (!schedule.afterMatchId) return "Dependência ainda não escolhida";
        const previous = matchLabels.get(schedule.afterMatchId);
        return previous ? "Logo após " + previous : "Após uma partida não encontrada";
      }
      return "A definir";
    };

    const totalTerminalWinners = matchNodes.filter((node) => !outgoingFor(node.id, "winner")).length;
    const isFinalMatch = (node, row) => {
      const namedFinal = /final/i.test(String(node.label || ""));
      return namedFinal || (totalTerminalWinners === 1 && !outgoingFor(node.id, "winner"));
    };
    const outcome = (node, result, row) => {
      const edge = outgoingFor(node.id, result);
      if (edge) return "Avança para " + targetDescription(edge, nodes, rowsById, stagesById, matchNodes);
      if (result === "loser") return "Eliminado do campeonato";
      return isFinalMatch(node, row) ? "Conquista o campeonato" : "Próxima partida ainda não conectada";
    };
    const slotName = (node, row, slot) => {
      const teamId = slot === "A" ? row?.team_a_id : row?.team_b_id;
      if (teamId) return teamFromId(teamId);
      const edge = incomingFor(node.id, slot);
      if (edge) return "Aguardando " + sourceDescription(edge, nodes, rowsById, matchNodes).toLowerCase();
      const savedTeamId = node.slots?.[slot];
      return savedTeamId ? teamFromId(savedTeamId) : "A definir";
    };
    const statusFor = (row, teamA, teamB) => row?.status ? statusText(row.status) : (teamA !== "A definir" && teamB !== "A definir" ? "Pronta" : "Aguardando equipes");

    const htmlRows = [];
    nodes.filter((node) => node.type === "group").forEach((group) => {
      const fixtures = (group.fixtures || []).slice().sort((a, b) => Number(a.round || 1) - Number(b.round || 1));
      const groupName = group.name || "Grupo";
      const groupEdges = edges.filter((edge) => edge.from === group.id && /^place_[1-8]$/.test(edge.result || ""))
        .sort((a, b) => Number(a.result.slice(6)) - Number(b.result.slice(6)));
      const advancement = groupEdges.length
        ? groupEdges.map((edge) => ordinal(edge.result) + " → " + targetDescription(edge, nodes, rowsById, stagesById, matchNodes)).join(" · ")
        : "O avanço para a próxima fase ainda não foi conectado.";
      htmlRows.push('<tr class="acs-public-table-section"><th colspan="7">' + escapeHtml("Fase de grupos · " + groupName) +
        '<small>Avanço por classificação: ' + escapeHtml(advancement) + '</small></th></tr>');

      fixtures.forEach((fixture, index) => {
        const fixtureId = fixture.bracketId || fixture.id;
        const row = rowsById.get(fixtureId) || rows.find((item) => item.id === fixtureId) || null;
        const teamAId = row?.team_a_id || fixture.teamA;
        const teamBId = row?.team_b_id || fixture.teamB;
        const teamA = teamFromId(teamAId) || "A definir";
        const teamB = teamFromId(teamBId) || "A definir";
        htmlRows.push('<tr>' +
          '<td>Grupo ' + escapeHtml(groupName.replace(/^Grupo\s*/i, "")) + ' · R' + Number(fixture.round || 1) + '</td>' +
          '<td>Jogo ' + String(index + 1).padStart(2, "0") + '</td>' +
          '<td><span class="acs-public-schedule-value">' + escapeHtml(scheduleSummary(fixture.schedule)) + '</span></td>' +
          '<td><b>' + escapeHtml(teamA) + '</b><span class="acs-public-vs"> × </span><b>' + escapeHtml(teamB) + '</b></td>' +
          '<td><span class="acs-public-outcome">Resultado contabilizado na classificação</span></td>' +
          '<td><span class="acs-public-outcome muted">Segue no grupo e disputa os jogos restantes</span></td>' +
          '<td><span class="acs-public-status ' + (row?.status === "completed" ? "done" : "") + '">' + escapeHtml(statusFor(row, teamA, teamB)) + '</span></td>' +
        '</tr>');
      });
      if (!fixtures.length) htmlRows.push('<tr><td colspan="7" class="acs-public-table-empty">Ainda não há confrontos neste grupo.</td></tr>');
    });

    matchNodes.map((node) => ({ node, row: rowForNode(node) }))
      .sort((a, b) => Number(a.row?.round_number || 1) - Number(b.row?.round_number || 1) ||
        Number(a.row?.match_number || 0) - Number(b.row?.match_number || 0))
      .forEach(({ node, row }, index) => {
        const stageName = row?.bracket_side === "main" ? "Mata-mata" : (stagesById.get(row?.stage_id) || "Mata-mata");
        const teamA = slotName(node, row, "A") || "A definir";
        const teamB = slotName(node, row, "B") || "A definir";
        const winner = row?.winner_team_id ? teamFromId(row.winner_team_id) : null;
        htmlRows.push('<tr>' +
          '<td>' + escapeHtml(stageName) + ' · R' + Number(row?.round_number || 1) + '</td>' +
          '<td>' + escapeHtml(nodeTitle(node, row, matchNodes)) + '</td>' +
          '<td><span class="acs-public-schedule-value">' + escapeHtml(scheduleSummary(node.schedule)) + '</span></td>' +
          '<td><b class="' + (winner && row?.winner_team_id === row?.team_a_id ? "acs-public-winner" : "") + '">' + escapeHtml(teamA) + '</b>' +
            '<span class="acs-public-vs"> × </span><b class="' + (winner && row?.winner_team_id === row?.team_b_id ? "acs-public-winner" : "") + '">' + escapeHtml(teamB) + '</b>' +
            (winner ? '<small class="acs-public-result-note">Vencedor: ' + escapeHtml(winner) + '</small>' : '') + '</td>' +
          '<td><span class="acs-public-outcome win">' + escapeHtml(outcome(node, "winner", row)) + '</span></td>' +
          '<td><span class="acs-public-outcome lose">' + escapeHtml(outcome(node, "loser", row)) + '</span></td>' +
          '<td><span class="acs-public-status ' + (row?.status === "completed" ? "done" : row?.status === "live" ? "live" : "") + '">' +
            escapeHtml(statusFor(row, teamA, teamB)) + '</span></td>' +
        '</tr>');
      });

    host.innerHTML = htmlRows.length
      ? '<div class="acs-public-table-scroll"><table class="acs-public-schedule-table"><thead><tr>' +
        '<th>Fase / rodada</th><th>Partida</th><th>Data / horário</th><th>Confronto</th><th>Se vencer</th><th>Se perder</th><th>Status</th>' +
        '</tr></thead><tbody>' + htmlRows.join("") + '</tbody></table></div>' +
        '<p class="acs-public-table-footnote">Os caminhos de vitória e derrota seguem as conexões definidas pela organização no quadro do campeonato.</p>'
      : '<div class="market-empty">A organização ainda não adicionou jogos ao quadro.</div>';
  }

  async function refresh() {
    const version = ++requestVersion;
    if (typeof supabaseClient === "undefined" || !supabaseClient) {
      host.innerHTML = '<div class="market-empty">Não foi possível conectar ao campeonato.</div>';
      return;
    }
    host.innerHTML = '<div class="market-empty">Carregando tabela de jogos...</div>';
    try {
      const [documentResult, nodesResult, stagesResult, registrationsResult] = await Promise.all([
        supabaseClient.from("tournament_board_documents").select("board_json,updated_at").eq("tournament_id", tournamentId).maybeSingle(),
        supabaseClient.from("tournament_bracket_nodes").select("*").eq("tournament_id", tournamentId),
        supabaseClient.from("tournament_stages").select("id,name,stage_order").eq("tournament_id", tournamentId).order("stage_order"),
        supabaseClient.from("tournament_registrations").select("team_id,teams(id,name,tag,logo_url)").eq("tournament_id", tournamentId).eq("status", "approved")
      ]);
      if (version !== requestVersion) return;
      const failed = [documentResult, nodesResult, stagesResult, registrationsResult].find((result) => result.error);
      if (failed) throw failed.error;
      const board = documentResult.data?.board_json || { nodes: [], edges: [] };
      const nodes = Array.isArray(board.nodes) ? board.nodes : [];
      if (!nodes.length) {
        panel.hidden = true;
        $(".tournament-bracket-panel")?.classList.remove("acs-public-table-replaced");
        return;
      }
      panel.hidden = false;
      $(".tournament-bracket-panel")?.classList.add("acs-public-table-replaced");
      renderTable(board, nodesResult.data || [], stagesResult.data || [], registrationsResult.data || []);
      const updated = documentResult.data?.updated_at
        ? new Date(documentResult.data.updated_at).toLocaleString("pt-BR")
        : "sem horário registrado";
      const stamp = $("#tournamentPublicScheduleUpdated");
      if (stamp) stamp.textContent = "Atualizado em " + updated;
    } catch (error) {
      if (version !== requestVersion) return;
      host.innerHTML = '<div class="market-empty">Falha ao carregar a tabela: ' + escapeHtml(error?.message || "erro inesperado") + '</div>';
    }
  }

  $("#refreshTournamentPublicSchedule")?.addEventListener("click", refresh);
  $("#refreshTournaments")?.addEventListener("click", () => window.setTimeout(refresh, 350));
  window.addEventListener("acs:tournament-board-updated", refresh);
  refresh();
  window.ACS_PUBLIC_TOURNAMENT_TABLE = { refresh };
})();

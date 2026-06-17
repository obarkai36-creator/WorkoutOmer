/* =============================================================================
 * app.js — renders the analysis into the dashboard panels + charts.
 * Depends on: data.js (window.GYM_DATA), engine.js (window.GYM_ENGINE), Chart.js
 * ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmtPct = (v) => `${v}%`;
  let IS_PDF = false; // set in boot(); avoids canvas charts in the printed PDF

  // Color ramp for fatigue / recovery (0% fresh -> 100% fried).
  function fatigueColor(pct) {
    if (pct < 30) return "#3fb950";   // recovered
    if (pct < 55) return "#d6a426";   // moderate
    if (pct < 80) return "#db7c2a";   // high
    return "#f0556b";                 // fried
  }
  const sevColor = { high: "#f0556b", med: "#db7c2a", low: "#d6a426", ok: "#3fb950" };

  function humanHours(h) {
    if (h < 1) return "ready now";
    if (h < 24) return `~${Math.round(h)}h`;
    const d = Math.floor(h / 24), r = Math.round(h % 24);
    return r ? `~${d}d ${r}h` : `~${d}d`;
  }
  function fmtWhen(date) {
    return date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  /* ---- header ------------------------------------------------------------- */
  function renderHeader(a, data) {
    $("athlete").textContent = data.ATHLETE.name;
    const latest = a.workouts[0];
    $("latest-date").innerHTML = latest
      ? `Latest: <b>${new Date(latest.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b> ${latest.note ? "· " + latest.note : ""}`
      : "No workouts logged";
    $("session-count").innerHTML = `<b>${a.workouts.length}</b> sessions logged`;
  }

  /* ---- 1. Muscle fatigue -------------------------------------------------- */
  function renderFatigue(a) {
    const el = $("fatigue-body");
    const order = ["Push", "Pull", "Legs", "Core", "Aerobic"];
    const sections = Object.values(a.sections).sort(
      (x, y) => order.indexOf(x.section) - order.indexOf(y.section)
    );
    el.innerHTML = sections.map((s) => `
      <div class="fatigue-section">
        <div class="sec-head">
          <span class="name">${s.section}</span>
          <span class="muted">${s.pct}% &middot; ${s.readyInHours < 1 ? "ready" : "ready in " + humanHours(s.readyInHours)}</span>
        </div>
        <div class="bar"><span style="width:${s.pct}%;background:${fatigueColor(s.pct)}"></span></div>
        <div style="margin-top:7px">
          ${s.muscles.map((m) => `
            <div class="mrow">
              <span class="ml">${m.label}</span>
              <span class="bar"><span style="width:${m.pct}%;background:${fatigueColor(m.pct)}"></span></span>
              <span class="mv" style="color:${fatigueColor(m.pct)}">${m.pct}%</span>
            </div>`).join("")}
        </div>
      </div>`).join("");
  }

  /* ---- 2. Workload progress (latest vs best, grouped by muscle group) ----- */
  function renderProgress(a) {
    const el = $("progress-body");
    const groups = a.progress;
    const sections = Object.keys(groups);
    if (!sections.length) { el.innerHTML = `<p class="muted">No exercises tracked.</p>`; return; }

    // Summary: how many lifts are at PR vs below.
    const all = sections.flatMap((s) => groups[s]);
    const atPR = all.filter((i) => i.isPR).length;

    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="v">${all.length}</div><div class="l">lifts tracked</div></div>
        <div class="kpi"><div class="v" style="color:var(--green)">${atPR}</div><div class="l">at personal best</div></div>
        <div class="kpi"><div class="v" style="color:var(--yellow)">${all.length - atPR}</div><div class="l">below best</div></div>
      </div>
      <div class="small muted" style="margin-bottom:8px">Bar = latest as % of your best · ★ = at/above PR · ● in today's session</div>
      ${sections.map((s) => `
        <div class="fatigue-section">
          <div class="sec-head"><span class="name">${s}</span><span class="muted">${groups[s].length} lifts</span></div>
          ${groups[s].map((it) => {
            const col = it.isPR ? "var(--green)" : it.pct >= 90 ? "var(--yellow)" : "var(--orange)";
            return `<div class="prog">
              <div class="top">
                <span class="name">${it.inToday ? "● " : ""}${it.name}</span>
                ${it.isPR ? '<span class="pr">★</span>' : `<span class="delta-down small">${it.pct}%</span>`}
              </div>
              <div class="bar" style="margin:4px 0"><span style="width:${Math.min(it.pct,100)}%;background:${col}"></span></div>
              <div class="meta">latest <b style="color:var(--text)">${it.latestText}</b>${it.belowPR ? ` &middot; best ${it.bestText}` : ""}${it.latest1RM ? " &middot; est 1RM " + it.latest1RM + "kg" : ""}</div>
            </div>`;
          }).join("")}
        </div>`).join("")}`;
  }

  /* ---- 3. Next recommended session --------------------------------------- */
  function renderRecommendation(a) {
    const r = a.recommendation;
    const el = $("reco-body");
    if (!r) { el.innerHTML = `<p class="muted">Log a few sessions to get a recommendation.</p>`; return; }

    const restTxt = r.readyNow
      ? `<span style="color:var(--green)">Ready to train now</span>`
      : `Rest <b>${humanHours(r.restHours)}</b> before training`;

    el.innerHTML = `
      <div class="reco">
        <div class="muted small">RECOMMENDED NEXT SESSION</div>
        <div class="big">${r.section} day</div>
        <div class="rest">${restTxt}</div>
        <div class="when">${r.readyNow ? "Earliest sensible slot: now" : "Ready around " + fmtWhen(r.readyAt)} &middot; ${r.neverLogged ? "no " + r.section.toLowerCase() + " session logged yet" : "last " + r.section.toLowerCase() + " " + r.daysSince + "d ago"}</div>
        <div style="margin-top:10px">
          ${r.suggestedExercises.map((e) => `<span class="chip">${e}</span>`).join("")}
        </div>
      </div>
      <div class="small muted" style="margin-bottom:8px">Recovery ranking</div>
      ${r.ranked.map((x) => `
        <div class="mrow">
          <span class="ml">${x.section}</span>
          <span class="bar"><span style="width:${x.fatigue}%;background:${fatigueColor(x.fatigue)}"></span></span>
          <span class="mv">${x.readyInHours < 1 ? "ready" : humanHours(x.readyInHours)}</span>
        </div>`).join("")}
      <div class="small muted" style="margin-top:12px">
        Aerobic this week: <b style="color:var(--text)">${r.aerobicLast7}/${r.aerobicTarget}</b>${r.aerobicLast7 < r.aerobicTarget ? " — fit in an easy session" : " — on track"}
      </div>`;
  }

  /* ---- 4. Injury alerts --------------------------------------------------- */
  function renderAlerts(a) {
    const el = $("alerts-body");
    const z = a.trends.acwrZone;
    const zColor = { danger: "var(--red)", caution: "var(--orange)", detraining: "var(--yellow)", ok: "var(--green)", insufficient: "var(--muted)" }[z] || "var(--green)";
    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="v" style="color:${zColor}">${a.trends.acwr ?? "n/a"}</div><div class="l">Load ratio (ACWR)</div></div>
        <div class="kpi"><div class="v">${a.trends.sessions28}</div><div class="l">sessions / 28d</div></div>
      </div>
      ${a.alerts.map((al) => `
        <div class="alert">
          <div class="sev" style="background:${sevColor[al.level]}"></div>
          <div><div class="t">${al.title}</div><div class="d">${al.detail}</div></div>
        </div>`).join("")}`;
  }

  /* ---- 5. Suggested changes ---------------------------------------------- */
  function renderChanges(a) {
    $("changes-body").innerHTML = a.changes.map((c, i) => `
      <div class="change"><div class="num">${i + 1}</div><div>${c}</div></div>`).join("");
  }

  /* ---- 6. Timing + weekly load ------------------------------------------- */
  function renderTiming(a) {
    const t = a.timing;
    const el = $("timing-body");
    if (!t) { el.innerHTML = `<p class="muted">No data.</p>`; return; }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const maxDow = Math.max(...t.dow, 1);

    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="v">${t.perWeek}</div><div class="l">sessions / week</div></div>
        <div class="kpi"><div class="v">${t.avgGap ?? "—"}d</div><div class="l">avg rest gap</div></div>
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="v" style="text-transform:capitalize">${t.todPref}</div><div class="l">typical time (~${t.avgHour}:00)</div></div>
        <div class="kpi"><div class="v">${t.daysSinceLast}d</div><div class="l">since last session</div></div>
      </div>
      <div class="small muted" style="margin-top:8px">Sessions by day of week</div>
      <div class="dow">
        ${t.dow.map((c, i) => `
          <div class="col">
            <div class="b" style="height:${(c / maxDow) * 46}px"></div>
            <div class="lbl">${days[i][0]}</div>
          </div>`).join("")}
      </div>
      <div class="small muted" style="margin:16px 0 6px">Weekly training load (6 wks)</div>` +
      // PDF: lightweight CSS bars (no canvas). Screen: Chart.js line.
      (IS_PDF
        ? (() => {
            const wk = a.trends.weeks, mx = Math.max(...wk.map((w) => w.stress), 1);
            return `<div class="loadbars">${wk.map((w) => `<div class="col"><div class="b" style="height:${(w.stress / mx) * 46}px"></div><div class="lbl">${w.label}</div></div>`).join("")}</div>`;
          })()
        : `<canvas id="loadChart" height="150"></canvas>`);

    if (!IS_PDF) {
      new Chart($("loadChart"), {
        type: "line",
        data: {
          labels: a.trends.weeks.map((w) => w.label),
          datasets: [{
            label: "Load", data: a.trends.weeks.map((w) => w.stress),
            borderColor: "#4ea1ff", backgroundColor: "rgba(78,161,255,.15)",
            fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: "#4ea1ff",
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#8b97a7", font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: "#8b97a7", font: { size: 10 } }, grid: { color: "#2c3542" }, beginAtZero: true },
          },
        },
      });
    }
  }

  /* ---- 7. Aerobic / cardio ------------------------------------------------ */
  function fmtPace(min) {
    if (min == null) return "—";
    const m = Math.floor(min), s = Math.round((min - m) * 60);
    return `${m}:${String(s).padStart(2, "0")}/km`;
  }
  function renderCardio(a) {
    const el = $("cardio-body"); const c = a.aerobic;
    if (!c.any) { el.innerHTML = `<p class="muted">No cardio logged yet.</p>`; return; }
    const zoneColors = { Z1: "#3fb950", Z2: "#4ea1ff", Z3: "#d6a426", Z4: "#db7c2a", Z5: "#f0556b" };
    const zTotal = Object.values(c.zones).reduce((x, y) => x + y, 0) || 1;
    let trend = "";
    if (c.paceTrend != null) {
      const secs = Math.round(Math.abs(c.paceTrend) * 60);
      trend = c.paceTrend < -0.01 ? `<span class="delta-up">▲ ${secs}s/km faster</span>`
        : c.paceTrend > 0.01 ? `<span class="delta-down">▼ ${secs}s/km slower</span>` : `<span class="delta-flat">▬ steady</span>`;
    }
    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="v">${c.km28}<span style="font-size:12px"> km</span></div><div class="l">last 28 days</div></div>
        <div class="kpi"><div class="v">${c.count}</div><div class="l">sessions</div></div>
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="v">${fmtPace(c.avgPace)}</div><div class="l">avg pace</div></div>
        <div class="kpi"><div class="v">${c.avgHr ?? "—"}<span style="font-size:12px"> bpm</span></div><div class="l">avg HR</div></div>
      </div>
      <div class="small" style="margin:2px 0 8px">Best ${fmtPace(c.bestPace)} &middot; longest ${c.longest} km &middot; ${c.daysSinceLast}d ago ${trend}</div>
      <div class="small muted" style="margin-bottom:4px">HR zones (est, max ~${c.maxHr} bpm)</div>
      <div class="loadbars" style="height:42px">
        ${["Z1","Z2","Z3","Z4","Z5"].map((z) => `<div class="col"><div class="b" style="height:${(c.zones[z] / zTotal) * 34}px;background:${zoneColors[z]}"></div><div class="lbl">${z}</div></div>`).join("")}
      </div>
      <div class="small muted" style="margin:10px 0 4px">Recent</div>
      ${c.recent.map((s) => `<div class="prog" style="padding:4px 0"><div class="top"><span class="name">${s.name}</span><span class="small muted">${new Date(s.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div><div class="meta">${s.distanceKm ? s.distanceKm + " km &middot; " : ""}${Math.round(s.durationMin)} min${s.pace != null ? " &middot; " + fmtPace(s.pace) : ""}${s.avgHr ? " &middot; " + s.avgHr + " bpm" : ""}</div></div>`).join("")}`;
  }

  /* ---- 8. Relative strength ----------------------------------------------- */
  function renderRelStr(a) {
    const el = $("relstr-body"); const r = a.relstrength;
    if (!r.items.length) { el.innerHTML = `<p class="muted">No key compound lifts tracked.</p>`; return; }
    const maxRatio = Math.max(...r.items.map((i) => i.ratio), 2.5);
    const bw = a.bodyweight;
    let bwLine = `bodyweight ${r.bodyweightKg} kg`;
    if (bw && bw.any && bw.delta != null) {
      const cls = bw.delta < 0 ? "delta-up" : bw.delta > 0 ? "delta-down" : "delta-flat";
      const arrow = bw.delta < 0 ? "▼" : bw.delta > 0 ? "▲" : "▬";
      bwLine = `bodyweight <b style="color:var(--text)">${bw.current} kg</b> <span class="${cls}">${arrow} ${Math.abs(bw.delta)} kg</span>`;
    }
    el.innerHTML = `<div class="small muted" style="margin-bottom:8px">Estimated 1RM ÷ ${bwLine}</div>` +
      r.items.map((it) => `
        <div class="mrow">
          <span class="ml" style="width:130px">${it.name}</span>
          <span class="bar"><span style="width:${Math.min((it.ratio / maxRatio) * 100, 100)}%;background:var(--accent)"></span></span>
          <span class="mv"><b style="color:var(--text)">${it.ratio}×</b></span>
        </div>
        <div class="meta" style="margin:-1px 0 6px 138px;color:var(--muted);font-size:11px">est 1RM ${it.oneRM} kg</div>`).join("");
  }

  /* ---- 9. Bodyweight tracker ---------------------------------------------- */
  function renderBodyweight(a) {
    const el = $("bw-body"); const b = a.bodyweight;
    if (!b || !b.any) { el.innerHTML = `<p class="muted">No weigh-ins logged yet. Add them to the BODYWEIGHT log in data.js.</p>`; return; }
    const hist = b.history.slice().reverse(); // oldest → newest for the chart
    const lo = b.min, hi = b.max, span = (hi - lo) || 1;
    const cls = b.delta < 0 ? "delta-up" : b.delta > 0 ? "delta-down" : "delta-flat";
    const arrow = b.delta < 0 ? "▼" : b.delta > 0 ? "▲" : "▬";
    const deltaTxt = b.delta == null ? "—" : `${arrow} ${Math.abs(b.delta)} kg`;
    const netTxt = b.totalChange == null ? "" : ` &middot; net ${b.totalChange > 0 ? "+" : ""}${b.totalChange} kg`;
    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="v">${b.current}<span style="font-size:12px"> kg</span></div><div class="l">latest weigh-in</div></div>
        <div class="kpi"><div class="v ${cls}" style="font-size:16px">${deltaTxt}</div><div class="l">since previous</div></div>
      </div>
      <div class="small muted" style="margin:2px 0 6px">range ${lo}–${hi} kg${netTxt}</div>
      <div class="loadbars" style="height:54px">
        ${hist.map((h) => {
          const ht = 8 + ((h.kg - lo) / span) * 38;
          return `<div class="col"><div class="b" style="height:${ht}px;background:var(--accent)" title="${h.kg} kg"></div><div class="lbl">${new Date(h.datetime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div></div>`;
        }).join("")}
      </div>
      <div class="small muted" style="margin:10px 0 4px">Weigh-ins</div>
      ${b.history.map((h) => `<div class="prog" style="padding:3px 0"><div class="top"><span class="name">${h.kg} kg</span><span class="small muted">${new Date(h.datetime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div></div>`).join("")}`;
  }

  /* ---- boot --------------------------------------------------------------- */
  function boot() {
    if (!window.GYM_DATA || !window.GYM_ENGINE) {
      document.body.innerHTML = "<p style='padding:24px;color:#f0556b'>Failed to load data/engine. Check the console.</p>";
      return;
    }
    // Use a fixed "today" if provided in the URL (?now=2026-06-13), else real now.
    const params = new URLSearchParams(location.search);
    const now = params.get("now") ? new Date(params.get("now")).getTime() : Date.now();

    // PDF/print mode (?pdf=1): reflow panels into a printable grid, no animation.
    const pdfMode = params.get("pdf") === "1";
    IS_PDF = pdfMode;
    if (pdfMode) {
      document.body.classList.add("pdf");
      if (window.Chart) window.Chart.defaults.animation = false;
    }

    const a = window.GYM_ENGINE.analyze(window.GYM_DATA, now);
    window.__ANALYSIS = a; // handy for debugging in the console

    renderHeader(a, window.GYM_DATA);
    renderFatigue(a);
    renderProgress(a);
    renderRecommendation(a);
    renderAlerts(a);
    renderChanges(a);
    renderTiming(a);
    renderCardio(a);
    renderRelStr(a);
    renderBodyweight(a);

    // Signal to the PDF renderer that the page is fully drawn.
    window.__READY = true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

const $ = (id) => document.getElementById(id);

function renderRows(rows) {
  const body = $("logsBody");
  body.innerHTML = "";
  for (const monthRow of rows) {
    const clients = Array.isArray(monthRow.clients) ? monthRow.clients : [];
    if (!clients.length) {
      const tr = document.createElement("tr");
      tr.className = "emptyRow";
      tr.innerHTML = `
        <td class="monthCell">${monthRow.month}</td>
        <td>データなし</td>
        <td class="num">0</td>
      `;
      body.appendChild(tr);
      continue;
    }

    clients.forEach((client, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="monthCell">${index === 0 ? monthRow.month : ""}</td>
        <td class="clientCell">${client.clientId}</td>
        <td class="num">${Number(client.accessCount || 0).toLocaleString("ja-JP")}</td>
      `;
      body.appendChild(tr);
    });
  }
}

async function loadMonthlyLogs() {
  const months = Number($("monthsSelect").value || 12);
  const status = $("statusText");
  status.textContent = "読み込み中...";

  try {
    const res = await fetch(`/api/logs/monthly?months=${encodeURIComponent(String(months))}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.rows)) throw new Error("invalid payload");
    renderRows(data.rows);
    const clientRows = data.rows.reduce((sum, row) => sum + ((Array.isArray(row.clients) ? row.clients.length : 0)), 0);
    status.textContent = `表示月数: ${data.rows.length} / 端末行数: ${clientRows}`;
  } catch (e) {
    renderRows([]);
    status.textContent = "ログ取得に失敗しました。Cloudflare Pages Functions と D1 の設定を確認してください。";
  }
}

function wire() {
  $("reloadBtn").addEventListener("click", loadMonthlyLogs);
  $("monthsSelect").addEventListener("change", loadMonthlyLogs);
}

wire();
loadMonthlyLogs();

(() => {
  const input = document.getElementById("checkban-input");
  if (!input) return;
  const file = document.getElementById("checkban-file");
  const validCount = document.getElementById("checkban-valid");
  const invalidCount = document.getElementById("checkban-invalid");
  const state = document.getElementById("checkban-state");
  const rows = document.getElementById("checkban-rows");
  const results = document.getElementById("checkban-results");
  const message = document.getElementById("checkban-message");
  let output = [];

  file.addEventListener("change", async () => {
    const selected = file.files && file.files[0];
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) {
      message.textContent = "File vượt quá giới hạn 5 MB.";
      file.value = "";
      return;
    }
    try {
      input.value = (await selected.text()).replace(/^\uFEFF/, "");
      message.textContent = "Đã đọc " + selected.name;
    } catch {
      message.textContent = "Không thể đọc file TXT.";
    }
  });

  document.getElementById("checkban-prepare").addEventListener("click", () => {
    output = [];
    let invalid = 0;
    for (const raw of input.value.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split("|");
      const username = (parts[0] || "").trim();
      const password = (parts[1] || "").trim();
      const nickname = parts.slice(2).join("|").trim();
      if (parts.length < 2 || !username || !password ||
          username.length > 200 || password.length > 500 || nickname.length > 200) {
        invalid++;
        continue;
      }
      output.push({username, password, nickname, status:"khong xac dinh"});
    }
    validCount.textContent = output.length.toLocaleString("vi-VN");
    invalidCount.textContent = invalid.toLocaleString("vi-VN");
    state.textContent = output.length ? "Đã chuẩn hóa" : "Không có dòng hợp lệ";
    rows.replaceChildren();
    output.forEach((item, index) => {
      const tr = document.createElement("tr");
      for (const value of [String(index + 1), item.username, item.nickname || "—", item.status]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      tr.lastChild.className = "checkban-status";
      rows.appendChild(tr);
    });
    results.classList.toggle("hidden", output.length === 0);
    message.textContent = "Đã chuẩn hóa " + output.length.toLocaleString("vi-VN") +
      " tài khoản; chưa kết nối nguồn tra cứu Garena.";
  });

  const resultText = () => output.map(x =>
    x.username + "|" + x.password + (x.nickname ? "|" + x.nickname : "") + " == " + x.status
  ).join("\n") + (output.length ? "\n" : "");

  document.getElementById("checkban-download").addEventListener("click", () => {
    if (!output.length) return;
    const blob = new Blob(["\uFEFF" + resultText()], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lq-check-ban-results.txt";
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("checkban-copy").addEventListener("click", async () => {
    if (!output.length) return;
    try {
      await navigator.clipboard.writeText(resultText());
      message.textContent = "Đã sao chép kết quả.";
    } catch {
      message.textContent = "Trình duyệt không cho phép sao chép.";
    }
  });
})();


// Public nickname lookup by OpenID (Garena Shop provider).
(() => {
  const button = document.getElementById("player-lookup");
  if (!button) return;
  const input = document.getElementById("player-openid");
  const result = document.getElementById("player-lookup-result");
  button.addEventListener("click", async () => {
    const playerId = input.value.trim();
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(playerId)) {
      result.textContent = "OpenID không hợp lệ. Hãy nhập ID từ 4–64 ký tự.";
      return;
    }
    button.disabled = true;
    result.textContent = "Đang truy vấn Garena Shop…";
    try {
      const response = await fetch("/api/player-nickname", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({player_id: playerId})
      });
      const data = await response.json();
      if (!response.ok || !data.found) {
        result.textContent = data.error || "Không tìm thấy nickname.";
      } else {
        result.textContent = "OpenID: " + data.player_id + " · Nickname: " + data.nickname + " · Nguồn: " + data.source;
      }
    } catch {
      result.textContent = "Không thể kết nối máy chủ LQ Account Tool.";
    } finally {
      button.disabled = false;
    }
  });
})();

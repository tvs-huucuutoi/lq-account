(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fileInput = $("safe-file");
  const processButton = $("safe-process");
  const reportBox = $("safe-report");
  const MAX_BYTES = 20 * 1024 * 1024;
  let selectedFile = null;
  let reportText = "";

  function status(message) { $("safe-status").textContent = message; }
  function reset() {
    selectedFile = null;
    reportText = "";
    fileInput.value = "";
    $("safe-file-name").textContent = "Chưa chọn file";
    processButton.disabled = true;
    ["safe-valid", "safe-duplicates", "safe-invalid", "safe-total"].forEach(id => $(id).textContent = "0");
    $("safe-result-count").textContent = "CHƯA KIỂM TRA";
    reportBox.textContent = "Báo cáo sẽ hiển thị tại đây sau khi kiểm tra. Báo cáo chỉ gồm số liệu và vị trí dòng, không chứa nội dung gốc.";
    $("safe-copy").disabled = true;
    $("safe-download").disabled = true;
    $("safe-progress").hidden = true;
    $("safe-progress-bar").style.width = "0%";
    status("");
  }

  function parseForSummary(source) {
    const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
    const seen = new Set();
    let valid = 0, duplicates = 0, invalid = 0, blank = 0;
    const report = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) { blank++; continue; }
      const hasPairShape = /^[^|:\s]+\s*[|:，,]\s*[^|:\s]+/.test(line);
      if (!hasPairShape) { invalid++; continue; }
      const fingerprint = line.toLocaleLowerCase("vi-VN");
      if (seen.has(fingerprint)) { duplicates++; continue; }
      seen.add(fingerprint);
      valid++;
      report.push("Dòng " + (index + 1) + ": [ĐÃ CHE NỘI DUNG]");
    }
    seen.clear();
    return { valid, duplicates, invalid, blank, total: lines.length, report };
  }

  async function readLocalFile(file) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (file.size > MAX_BYTES) throw new Error("File vượt quá giới hạn 20 MB.");
    if (ext === "txt") return await file.text();
    if (ext === "docx") {
      if (!window.mammoth) throw new Error("Không tải được thư viện đọc DOCX. Kiểm tra kết nối Internet rồi thử lại.");
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value;
    }
    throw new Error("Chỉ hỗ trợ file TXT hoặc DOCX.");
  }

  function acceptFile(file) {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["txt", "docx"].includes(ext)) { status("Chỉ hỗ trợ file TXT hoặc DOCX."); return; }
    if (file.size > MAX_BYTES) { status("File vượt quá giới hạn 20 MB."); return; }
    selectedFile = file;
    reportText = "";
    $("safe-copy").disabled = true;
    $("safe-download").disabled = true;
    $("safe-file-name").textContent = "Đã chọn: " + file.name + " (" + (file.size / 1024 / 1024).toFixed(2) + " MB)";
    processButton.disabled = false;
    status("Tệp đã sẵn sàng. Nội dung sẽ được xử lý ngay trên thiết bị.");
  }

  fileInput.addEventListener("change", () => acceptFile(fileInput.files[0]));
  $("safe-drop").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
  });

  processButton.addEventListener("click", async () => {
    if (!selectedFile) return;
    processButton.disabled = true;
    $("safe-progress").hidden = false;
    $("safe-progress-bar").style.width = "30%";
    status("Đang đọc và kiểm tra trên trình duyệt...");
    try {
      const source = await readLocalFile(selectedFile);
      $("safe-progress-bar").style.width = "65%";
      const result = parseForSummary(source);
      $("safe-progress-bar").style.width = "85%";
      $("safe-valid").textContent = result.valid.toLocaleString("vi-VN");
      $("safe-duplicates").textContent = result.duplicates.toLocaleString("vi-VN");
      $("safe-invalid").textContent = result.invalid.toLocaleString("vi-VN");
      $("safe-total").textContent = result.total.toLocaleString("vi-VN");
      $("safe-result-count").textContent = result.valid.toLocaleString("vi-VN") + " DÒNG ĐÃ KIỂM TRA";
      reportText = [
        "BÁO CÁO KIỂM TRA FILE",
        "Dòng có cấu trúc: " + result.valid,
        "Dòng trùng: " + result.duplicates,
        "Dòng không hợp lệ: " + result.invalid,
        "Dòng trống: " + result.blank,
        "Tổng số dòng: " + result.total,
        "",
        "DANH SÁCH VỊ TRÍ (NỘI DUNG ĐÃ CHE)",
        ...(result.report.length ? result.report : ["Không có dòng dữ liệu hợp lệ."]),
        "",
        "Báo cáo không chứa nội dung gốc hoặc thông tin đăng nhập."
      ].join("\n");
      reportBox.textContent = reportText;

      try {
        const csrfResponse = await fetch("/api/csrf", { credentials: "same-origin" });
        if (!csrfResponse.ok) throw new Error("Không lấy được mã bảo vệ phiên.");
        const csrfData = await csrfResponse.json();
        const historyResponse = await fetch("/api/parser-history", {
          method: "POST",
          credentials: "same-origin",
          headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfData.csrf_token},
          body: JSON.stringify({
            file_type: selectedFile.name.toLowerCase().split(".").pop(),
            total_lines: result.total,
            valid_lines: result.valid,
            duplicate_lines: result.duplicates,
            invalid_lines: result.invalid,
            blank_lines: result.blank
          })
        });
        if (!historyResponse.ok) throw new Error("Không lưu được lịch sử thống kê.");
      } catch (historyError) {
        status("Đã kiểm tra file; lịch sử chưa lưu được: " + historyError.message);
      }
      $("safe-progress-bar").style.width = "100%";
      $("safe-copy").disabled = false;
      $("safe-download").disabled = false;
      status("Hoàn tất. Nội dung gốc không được hiển thị hoặc gửi lên máy chủ.");
    } catch (error) {
      status(error.message || "Không thể đọc file.");
    } finally {
      processButton.disabled = !selectedFile;
    }
  });

  $("safe-copy").addEventListener("click", async () => {
    if (!reportText) return;
    try { await navigator.clipboard.writeText(reportText); status("Đã sao chép báo cáo đã che."); }
    catch { status("Trình duyệt không cho phép sao chép tự động."); }
  });
  $("safe-download").addEventListener("click", () => {
    if (!reportText) return;
    const blob = new Blob(["\uFEFF" + reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "bao-cao-kiem-tra.txt"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("safe-clear").addEventListener("click", reset);
  const drop = $("safe-drop");
  ["dragenter", "dragover"].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", event => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    try { fileInput.files = event.dataTransfer.files; } catch (_) {}
    acceptFile(file);
  });
  reset();
})();
(() => {
  const $ = (id) => document.getElementById(id);
  const fileInput = $("safe-file");
  const processButton = $("safe-process");
  const reportBox = $("safe-report");
  let selectedFile = null;
  let reportText = "";

  function status(message) { $("safe-status").textContent = message; }
  function reset() {
    selectedFile = null;
    reportText = "";
    fileInput.value = "";
    $("safe-file-name").textContent = "Chưa chọn file";
    processButton.disabled = true;
    $("safe-valid").textContent = "0";
    $("safe-duplicates").textContent = "0";
    $("safe-invalid").textContent = "0";
    $("safe-total").textContent = "0";
    $("safe-result-count").textContent = "CHƯA KIỂM TRA";
    reportBox.textContent = "Báo cáo sẽ hiển thị sau khi kiểm tra file. Không có tên tài khoản, mật khẩu hay nội dung gốc nào được đưa vào báo cáo.";
    $("safe-copy").disabled = true;
    $("safe-download").disabled = true;
    status("");
  }

  function parseForSummary(source) {
    const lines = source.replace(/\uFEFF/g, "").split(/\r?\n/);
    const seen = new Set();
    let valid = 0, duplicates = 0, invalid = 0, blank = 0;
    const report = [];
    lines.forEach((raw, index) => {
      const line = raw.trim();
      if (!line) { blank++; return; }
      // Chỉ xác định cấu trúc. Không trích xuất hoặc đưa bất kỳ trường nào ra giao diện.
      const hasPairShape = /^[^|:\s]+\s*[|:，,]\s*[^|:\s]+/.test(line);
      if (!hasPairShape) { invalid++; return; }
      const fingerprint = line.toLocaleLowerCase("vi-VN");
      if (seen.has(fingerprint)) { duplicates++; return; }
      seen.add(fingerprint);
      valid++;
      report.push("Dòng " + (index + 1) + ": [ĐÃ CHE NỘI DUNG]");
    });
    return { valid, duplicates, invalid, blank, total: lines.length, report };
  }

  async function readLocalFile(file) {
    const ext = file.name.toLowerCase().split(".").pop();
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
    selectedFile = file;
    $("safe-file-name").textContent = "Đã chọn: " + file.name;
    processButton.disabled = false;
    status("Tệp đã sẵn sàng. Nội dung sẽ được xử lý ngay trên thiết bị.");
  }

  fileInput.addEventListener("change", () => acceptFile(fileInput.files[0]));
  processButton.addEventListener("click", async () => {
    if (!selectedFile) return;
    processButton.disabled = true;
    status("Đang đọc và kiểm tra trên trình duyệt...");
    try {
      const source = await readLocalFile(selectedFile);
      const result = parseForSummary(source);
      $("safe-valid").textContent = result.valid.toLocaleString("vi-VN");
      $("safe-duplicates").textContent = result.duplicates.toLocaleString("vi-VN");
      $("safe-invalid").textContent = result.invalid.toLocaleString("vi-VN");
      $("safe-total").textContent = result.total.toLocaleString("vi-VN");
      $("safe-result-count").textContent = result.valid.toLocaleString("vi-VN") + " DÒNG ĐÃ CHE";
      reportText = [
        "BÁO CÁO KIỂM TRA FILE",
        "Dòng có cấu trúc: " + result.valid,
        "Dòng trùng: " + result.duplicates,
        "Dòng không hợp lệ: " + result.invalid,
        "Dòng trống: " + result.blank,
        "Tổng số dòng: " + result.total,
        "",
        "DANH SÁCH ĐÃ CHE",
        ...(result.report.length ? result.report : ["Không có dòng dữ liệu hợp lệ."]),
        "",
        "Báo cáo không chứa nội dung gốc hoặc thông tin đăng nhập."
      ].join("\n");
      reportBox.textContent = reportText;

      // Persist summary metadata only; never send source text or file name.
      try {
        const csrfResponse = await fetch("/api/csrf");
        const csrfData = await csrfResponse.json();
        const historyResponse = await fetch("/api/parser-history", {
          method: "POST",
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
        if (!historyResponse.ok) throw new Error("Không lưu được lịch sử sử dụng.");
        status("Hoàn tất. Đã lưu lịch sử thống kê; nội dung file vẫn chỉ xử lý trên thiết bị.");
      } catch (historyError) {
        status("Đã kiểm tra file nhưng chưa lưu được lịch sử. " + historyError.message);
      }

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
    anchor.href = url; anchor.download = "bao-cao-du-lieu-da-che.txt"; anchor.click();
    URL.revokeObjectURL(url);
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
})();

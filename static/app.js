(() => {
  const form = document.getElementById("generator-form");
  if (!form) return;

  const quantity = document.getElementById("quantity");
  const quantityValue = document.getElementById("quantity-value");
  const button = document.getElementById("generate-button");
  const empty = document.getElementById("empty-state");
  const content = document.getElementById("result-content");
  const preview = document.getElementById("result-preview");
  const count = document.getElementById("result-count");
  const status = document.getElementById("status-text");
  const progress = document.getElementById("progress-bar");
  const download = document.getElementById("download-button");
  const copy = document.getElementById("copy-button");
  let generated = [];

  quantity.addEventListener("input", () => quantityValue.textContent = Number(quantity.value).toLocaleString("vi-VN"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> ĐANG TẠO...';
    status.textContent = "Đang xử lý yêu cầu";
    progress.style.width = "25%";

    try {
      const csrfResponse = await fetch("/api/csrf");
      const csrfData = await csrfResponse.json();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfData.csrf_token},
        body: JSON.stringify({
          quantity: Number(quantity.value),
          username_length: Number(document.getElementById("username-length").value),
          password_length: Number(document.getElementById("password-length").value)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tạo dữ liệu.");

      generated = data.results;
      preview.textContent = generated.slice(0, 12).join("\n") + (generated.length > 12 ? "\n…" : "");
      count.textContent = `${data.count.toLocaleString("vi-VN")} DÒNG`;
      document.getElementById("success-message").textContent = `Đã tạo ${data.count.toLocaleString("vi-VN")} cặp dữ liệu`;
      empty.classList.add("hidden");
      content.classList.remove("hidden");
      progress.style.width = "100%";
      status.textContent = data.passwords_visible
        ? "Hoàn tất • Admin được xem và tải mật khẩu."
        : "Hoàn tất • Mật khẩu đã được ẩn; chỉ admin đăng nhập mới xem được.";
    } catch (error) {
      status.textContent = error.message;
      progress.style.width = "0%";
      alert(error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>✦</span> TẠO DỮ LIỆU <span class="button-arrow">→</span>';
    }
  });

  download.addEventListener("click", () => {
    if (!generated.length) return;
    const blob = new Blob([generated.join("\n") + "\n"], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lq-account-data.txt";
    a.click();
    URL.revokeObjectURL(url);
  });

  copy.addEventListener("click", async () => {
    if (!generated.length) return;
    try {
      await navigator.clipboard.writeText(generated.join("\n"));
      copy.textContent = "Đã sao chép ✓";
      setTimeout(() => copy.textContent = "Sao chép", 1500);
    } catch {
      alert("Trình duyệt không cho phép sao chép tự động.");
    }
  });
})();


(() => {
  const form = document.getElementById("filter-form");
  if (!form) return;
  const fileInput = document.getElementById("filter-file");
  const button = document.getElementById("filter-button");
  const output = document.getElementById("filter-output");
  const preview = document.getElementById("filter-preview");
  const summary = document.getElementById("filter-summary");
  const status = document.getElementById("filter-status");
  const download = document.getElementById("filter-download");
  let filteredLines = [];

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["txt", "docx"].includes(ext)) {
      status.textContent = "Chỉ hỗ trợ file TXT hoặc DOCX.";
      return;
    }
    button.disabled = true;
    button.textContent = "ĐANG ĐỌC VÀ LỌC...";
    status.textContent = "Đang xử lý file...";
    const formData = new FormData();
    formData.append("file", file);
    try {
      const csrfResponse = await fetch("/api/csrf");
      const csrfData = await csrfResponse.json();
      const response = await fetch("/api/filter-file", {
        method: "POST",
        headers: {"X-CSRF-Token": csrfData.csrf_token},
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể lọc file.");
      filteredLines = data.results;
      preview.textContent = filteredLines.slice(0, 100).join("\n") +
        (filteredLines.length > 100 ? "\n… (còn " + (filteredLines.length - 100).toLocaleString("vi-VN") + " dòng)" : "");
      summary.textContent = "Đã trích xuất " + data.count.toLocaleString("vi-VN") +
        " dòng • Bỏ qua " + data.skipped.toLocaleString("vi-VN") + " dòng không hợp lệ.";
      output.classList.remove("hidden");
      status.textContent = data.count ? "Lọc hoàn tất." : "Không tìm thấy dòng đúng định dạng.";
    } catch (error) {
      status.textContent = error.message;
      alert(error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = '⌕ LỌC NỘI DUNG <span class="button-arrow">→</span>';
    }
  });

  download.addEventListener("click", () => {
    if (!filteredLines.length) return;
    const blob = new Blob(["\uFEFF" + filteredLines.join("\n") + "\n"], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lq-account-filtered.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  });

})();


(() => {
  const form = document.getElementById("keyword-search-form");
  if (!form) return;
  const fileInput = document.getElementById("filter-file");
  const button = document.getElementById("keyword-search-button");
  const output = document.getElementById("keyword-output");
  const preview = document.getElementById("keyword-preview");
  const summary = document.getElementById("keyword-summary");
  const status = document.getElementById("keyword-status");
  const download = document.getElementById("keyword-download");
  let matches = [];

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      status.textContent = "Hãy chọn file ở mục 01 trước.";
      return;
    }
    const keywords = {
      ss: document.getElementById("keyword-ss").value.trim(),
      sss: document.getElementById("keyword-sss").value.trim(),
      skin: document.getElementById("keyword-skin").value.trim()
    };
    if (!keywords.ss && !keywords.sss && !keywords.skin) {
      status.textContent = "Hãy nhập ít nhất một từ khóa.";
      return;
    }

    button.disabled = true;
    button.textContent = "ĐANG TÌM KIẾM...";
    status.textContent = "Đang quét nội dung file...";
    const formData = new FormData();
    formData.append("file", file);
    Object.entries(keywords).forEach(([key, value]) => formData.append(key, value));

    try {
      const csrfResponse = await fetch("/api/csrf");
      const csrfData = await csrfResponse.json();
      const response = await fetch("/api/search-filter", {
        method: "POST",
        headers: {"X-CSRF-Token": csrfData.csrf_token},
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tìm kiếm file.");
      matches = data.results || [];
      preview.textContent = matches.slice(0, 100).join("\n") +
        (matches.length > 100 ? "\n… (còn " + (matches.length - 100).toLocaleString("vi-VN") + " dòng)" : "");
      summary.textContent = "Tìm thấy " + data.count.toLocaleString("vi-VN") +
        " tài khoản khớp • Điều kiện OR.";
      output.classList.remove("hidden");
      status.textContent = matches.length ? "Tìm kiếm hoàn tất." : "Không tìm thấy tài khoản khớp.";
    } catch (error) {
      status.textContent = error.message;
      alert(error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = '⌕ TÌM VÀ LẤY TK|MK <span class="button-arrow">→</span>';
    }
  });

  download.addEventListener("click", () => {
    if (!matches.length) return;
    const blob = new Blob(["\uFEFF" + matches.join("\n") + "\n"], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lq-account-search-results.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  });
})();


(() => {
  const uploadForm = document.getElementById("library-upload-form");
  if (!uploadForm) return;

  const fileInput = document.getElementById("library-file");
  const uploadButton = document.getElementById("library-upload-button");
  const uploadStatus = document.getElementById("library-upload-status");
  const listNode = document.getElementById("stored-file-list");
  const listStatus = document.getElementById("library-list-status");
  const refreshButton = document.getElementById("library-refresh");
  const select = document.getElementById("stored-file-select");
  const searchForm = document.getElementById("stored-keyword-search-form");
  const searchButton = document.getElementById("stored-keyword-search-button");
  const searchStatus = document.getElementById("stored-keyword-status");
  const output = document.getElementById("stored-keyword-output");
  const summary = document.getElementById("stored-keyword-summary");
  const preview = document.getElementById("stored-keyword-preview");
  const download = document.getElementById("stored-keyword-download");
  let files = [];
  let matches = [];

  async function csrfToken() {
    const response = await fetch("/api/csrf");
    const data = await response.json();
    if (!response.ok || !data.csrf_token) throw new Error("Không lấy được mã bảo mật. Hãy tải lại trang.");
    return data.csrf_token;
  }

  function humanSize(bytes) {
    if (bytes === null || bytes === undefined || bytes === "") return "Dung lượng không rõ";
    const value = Number(bytes);
    return value < 1024 * 1024 ? (value / 1024).toFixed(1) + " KB" : (value / 1024 / 1024).toFixed(2) + " MB";
  }

  async function loadFiles() {
    listStatus.textContent = "Đang tải danh sách...";
    listNode.replaceChildren();
    try {
      const response = await fetch("/api/stored-files");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tải danh sách file.");
      files = data.files || [];
      select.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— Chọn file trong kho —";
      select.appendChild(placeholder);

      if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "empty-admin";
        empty.textContent = "Kho chưa có file nào. Hãy tải file TXT hoặc DOCX lên ở mục 01.";
        listNode.appendChild(empty);
      }

      files.forEach((file) => {
        const option = document.createElement("option");
        option.value = file.path;
        option.textContent = file.name;
        option.dataset.filename = file.name;
        select.appendChild(option);

        const row = document.createElement("div");
        row.className = "stored-file-row";
        const info = document.createElement("div");
        info.className = "stored-file-info";
        const name = document.createElement("strong");
        name.textContent = file.name;
        const meta = document.createElement("span");
        meta.textContent = humanSize(file.size);
        info.append(name, meta);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "small-action danger-action";
        remove.textContent = "Xóa";
        remove.addEventListener("click", async () => {
          if (!confirm("Xóa file " + file.name + " khỏi kho lưu trữ?")) return;
          remove.disabled = true;
          try {
            const token = await csrfToken();
            const deleted = await fetch("/api/stored-files", {
              method: "DELETE",
              headers: {"Content-Type": "application/json", "X-CSRF-Token": token},
              body: JSON.stringify({path: file.path})
            });
            const result = await deleted.json();
            if (!deleted.ok) throw new Error(result.error || "Không thể xóa file.");
            if (select.value === file.path) select.value = "";
            await loadFiles();
            listStatus.textContent = "Đã xóa file khỏi kho.";
          } catch (error) {
            alert(error.message);
            remove.disabled = false;
          }
        });
        row.append(info, remove);
        listNode.appendChild(row);
      });
      listStatus.textContent = files.length + " file đang được lưu.";
    } catch (error) {
      listStatus.textContent = error.message;
      const warning = document.createElement("div");
      warning.className = "error-box";
      warning.textContent = error.message;
      listNode.appendChild(warning);
    }
  }

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["txt", "docx"].includes(extension)) {
      uploadStatus.textContent = "Chỉ hỗ trợ TXT hoặc DOCX.";
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      uploadStatus.textContent = "File vượt quá giới hạn 25 MB.";
      return;
    }
    uploadButton.disabled = true;
    uploadButton.textContent = "ĐANG TẢI LÊN...";
    uploadStatus.textContent = "Đang lưu file vào Supabase...";
    try {
      const token = await csrfToken();
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/stored-files", {
        method: "POST",
        headers: {"X-CSRF-Token": token},
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể lưu file.");
      fileInput.value = "";
      uploadStatus.textContent = "Đã lưu " + data.name + " thành công.";
      await loadFiles();
      select.value = data.path;
    } catch (error) {
      uploadStatus.textContent = error.message;
      alert(error.message);
    } finally {
      uploadButton.disabled = false;
      uploadButton.innerHTML = '↑ TẢI FILE LÊN KHO <span class="button-arrow">→</span>';
    }
  });

  refreshButton.addEventListener("click", loadFiles);

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const path = select.value;
    const selected = select.options[select.selectedIndex];
    if (!path) {
      searchStatus.textContent = "Hãy chọn một file đã lưu.";
      return;
    }
    const keywords = {
      ss: document.getElementById("stored-keyword-ss").value.trim(),
      sss: document.getElementById("stored-keyword-sss").value.trim(),
      skin: document.getElementById("stored-keyword-skin").value.trim()
    };
    if (!keywords.ss && !keywords.sss && !keywords.skin) {
      searchStatus.textContent = "Hãy nhập ít nhất một từ khóa.";
      return;
    }
    searchButton.disabled = true;
    searchButton.textContent = "ĐANG TÌM KIẾM...";
    searchStatus.textContent = "Đang quét file đã lưu...";
    const formData = new FormData();
    formData.append("storage_path", path);
    formData.append("filename", selected.dataset.filename || selected.textContent);
    Object.entries(keywords).forEach(([key, value]) => formData.append(key, value));
    try {
      const token = await csrfToken();
      const response = await fetch("/api/search-filter", {
        method: "POST",
        headers: {"X-CSRF-Token": token},
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tìm kiếm file.");
      matches = data.results || [];
      preview.textContent = matches.slice(0, 100).join("\n") +
        (matches.length > 100 ? "\n… (còn " + (matches.length - 100).toLocaleString("vi-VN") + " dòng)" : "");
      summary.textContent = "Tìm thấy " + data.count.toLocaleString("vi-VN") + " tài khoản khớp • Điều kiện OR.";
      output.classList.remove("hidden");
      searchStatus.textContent = matches.length ? "Tìm kiếm hoàn tất." : "Không tìm thấy tài khoản khớp.";
    } catch (error) {
      searchStatus.textContent = error.message;
      alert(error.message);
    } finally {
      searchButton.disabled = false;
      searchButton.innerHTML = '⌕ TÌM VÀ LẤY TK|MK <span class="button-arrow">→</span>';
    }
  });

  download.addEventListener("click", () => {
    if (!matches.length) return;
    const blob = new Blob(["\uFEFF" + matches.join("\n") + "\n"], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lq-account-keyword-results.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  });

  loadFiles();
})();

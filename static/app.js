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

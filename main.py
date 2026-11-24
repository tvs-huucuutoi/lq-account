import customtkinter as ctk
from tkinter import filedialog, messagebox
import random
import string
import threading
import time

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

class LQAccountTool(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("LQ Account Tool")
        self.geometry("760x600")
        self.minsize(700, 560)
        self.generated = []
        self.build_ui()

    def build_ui(self):
        ctk.CTkLabel(self, text="LQ ACCOUNT TOOL", font=ctk.CTkFont(size=27, weight="bold")).pack(pady=(22, 4))
        ctk.CTkLabel(self, text="Sinh dữ liệu tk:mk • Kiểm thử trong Lab • Xuất TXT",
                     text_color="gray").pack(pady=(0, 18))

        panel = ctk.CTkFrame(self, corner_radius=14)
        panel.pack(fill="x", padx=24, pady=8)

        row1 = ctk.CTkFrame(panel, fg_color="transparent")
        row1.pack(fill="x", padx=16, pady=(16, 8))
        self.count = self.add_field(row1, "Số lượng", "100", 0)
        self.user_len = self.add_field(row1, "Độ dài tài khoản", "10", 1)
        self.pass_len = self.add_field(row1, "Độ dài mật khẩu", "12", 2)

        row2 = ctk.CTkFrame(panel, fg_color="transparent")
        row2.pack(fill="x", padx=16, pady=8)
        ctk.CTkLabel(row2, text="Kiểu tài khoản").pack(side="left", padx=(0, 10))
        self.user_mode = ctk.CTkOptionMenu(row2, values=["Chữ + số", "Chỉ chữ", "Chỉ số"])
        self.user_mode.pack(side="left", padx=5)
        ctk.CTkLabel(row2, text="Kiểu mật khẩu").pack(side="left", padx=(24, 10))
        self.pass_mode = ctk.CTkOptionMenu(row2, values=["Chữ + số", "Chữ + số + ký tự đặc biệt", "Chỉ chữ + số"])
        self.pass_mode.pack(side="left", padx=5)

        actions = ctk.CTkFrame(self, fg_color="transparent")
        actions.pack(fill="x", padx=24, pady=12)
        ctk.CTkButton(actions, text="TẠO DỮ LIỆU", height=42, command=self.start_generate).pack(side="left", expand=True, fill="x", padx=(0, 6))
        ctk.CTkButton(actions, text="XUẤT TXT", height=42, fg_color="#16834a", hover_color="#11663a",
                      command=self.export_txt).pack(side="left", expand=True, fill="x", padx=6)
        ctk.CTkButton(actions, text="XÓA", height=42, fg_color="#555", hover_color="#444",
                      command=self.clear).pack(side="left", expand=True, fill="x", padx=(6, 0))

        self.progress = ctk.CTkProgressBar(self)
        self.progress.pack(fill="x", padx=24, pady=(8, 4))
        self.progress.set(0)
        self.status = ctk.CTkLabel(self, text="Sẵn sàng", anchor="w", text_color="gray")
        self.status.pack(fill="x", padx=26, pady=(0, 8))

        self.output = ctk.CTkTextbox(self, corner_radius=12, font=ctk.CTkFont(family="Consolas", size=13))
        self.output.pack(fill="both", expand=True, padx=24, pady=(4, 20))
        self.output.insert("end", "Kết quả sẽ xuất hiện tại đây theo định dạng tk:mk\\n")
        self.output.configure(state="disabled")

    def add_field(self, parent, label, default, col):
        frame = ctk.CTkFrame(parent, fg_color="transparent")
        frame.grid(row=0, column=col, sticky="ew", padx=6)
        parent.grid_columnconfigure(col, weight=1)
        ctk.CTkLabel(frame, text=label).pack(anchor="w")
        entry = ctk.CTkEntry(frame, height=34)
        entry.pack(fill="x", pady=(5, 0))
        entry.insert(0, default)
        return entry

    def charset(self, mode):
        if mode == "Chỉ chữ":
            return string.ascii_lowercase
        if mode == "Chỉ số":
            return string.digits
        if mode == "Chữ + số + ký tự đặc biệt":
            return string.ascii_letters + string.digits + "!@#$%_-"
        return string.ascii_letters + string.digits

    def start_generate(self):
        try:
            count = int(self.count.get())
            ulen = int(self.user_len.get())
            plen = int(self.pass_len.get())
            if not (1 <= count <= 100000 and 3 <= ulen <= 64 and 4 <= plen <= 128):
                raise ValueError
        except ValueError:
            messagebox.showerror("Dữ liệu không hợp lệ", "Số lượng: 1–100000; tài khoản: 3–64 ký tự; mật khẩu: 4–128 ký tự.")
            return
        threading.Thread(target=self.generate, args=(count, ulen, plen), daemon=True).start()

    def generate(self, count, ulen, plen):
        users = self.charset(self.user_mode.get())
        passwords = self.charset(self.pass_mode.get())
        result = []
        seen = set()
        for i in range(count):
            while True:
                pair = ''.join(random.choices(users, k=ulen)) + ":" + ''.join(random.choices(passwords, k=plen))
                if pair not in seen:
                    seen.add(pair)
                    break
            result.append(pair)
            if i % max(1, count // 100) == 0 or i == count - 1:
                self.after(0, self.update_progress, (i + 1) / count, i + 1, count)
        self.generated = result
        self.after(0, self.show_results)

    def update_progress(self, value, done, total):
        self.progress.set(value)
        self.status.configure(text=f"Đã tạo {done:,}/{total:,} dòng")

    def show_results(self):
        self.output.configure(state="normal")
        self.output.delete("1.0", "end")
        self.output.insert("end", "\n".join(self.generated))
        self.output.configure(state="disabled")
        self.status.configure(text=f"Hoàn tất: {len(self.generated):,} cặp dữ liệu ngẫu nhiên. Đây không phải tài khoản Liên Quân đã xác minh.")

    def export_txt(self):
        if not self.generated:
            messagebox.showinfo("Chưa có dữ liệu", "Hãy tạo dữ liệu trước khi xuất.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt")],
                                            initialfile="account.txt")
        if not path:
            return
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(self.generated) + "\n")
        messagebox.showinfo("Đã xuất", f"Đã lưu {len(self.generated):,} dòng vào:\n{path}")

    def clear(self):
        self.generated = []
        self.progress.set(0)
        self.status.configure(text="Đã xóa dữ liệu")
        self.output.configure(state="normal")
        self.output.delete("1.0", "end")
        self.output.configure(state="disabled")

if __name__ == "__main__":
    app = LQAccountTool()
    app.mainloop()

import os
import re
import subprocess
import tempfile

def git(*args, data=None, env=None):
    p = subprocess.run(
        ["git", *args],
        input=data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env
    )
    if p.returncode:
        raise RuntimeError(p.stderr.decode("utf-8", "replace"))
    return p.stdout

# Xác định commit gốc
head = git("rev-parse", "HEAD").decode().strip()

# Lấy toàn bộ file từ HEAD dưới dạng byte
raw = git("ls-tree", "-rz", "--full-tree", "HEAD")

entries = []
for item in raw.split(b"\0"):
    if not item:
        continue

    meta, path = item.split(b"\t", 1)
    mode, kind, oid = meta.split(b" ", 2)

    # Chuẩn hóa các thành phần đường dẫn
    parts = path.decode("utf-8").split("/")

    fixed = []
    for part in parts:
        # Windows không hỗ trợ dấu cách/dấu chấm cuối tên
        fixed.append(part.rstrip(" ."))

    newpath = "/".join(fixed).encode("utf-8")

    if any(not part for part in fixed):
        raise RuntimeError(
            "Tên rỗng sau chuẩn hóa: " +
            path.decode("utf-8", "replace")
        )

    entries.append((mode, kind, oid, path, newpath))

# Kiểm tra trùng đường dẫn sau khi đổi tên
seen = set()
for mode, kind, oid, old, new in entries:
    key = new.decode("utf-8").casefold()
    if key in seen:
        raise RuntimeError(
            "Trùng đường dẫn sau chuẩn hóa: " +
            new.decode("utf-8", "replace")
        )
    seen.add(key)

changes = [(old, new) for _, _, _, old, new in entries if old != new]

print("Số file cần đổi đường dẫn:", len(changes))
for old, new in changes[:20]:
    print("OLD:", old.decode("utf-8"))
    print("NEW:", new.decode("utf-8"))

# Không tạo commit nếu không có thay đổi
if not changes:
    print("Không có đường dẫn cần sửa.")
    raise SystemExit(0)

# Tạo index tạm thời
with tempfile.TemporaryDirectory() as tmp:
    env = os.environ.copy()
    env["GIT_INDEX_FILE"] = os.path.join(tmp, "index")

    # Đưa blob gốc vào index mới, giữ nguyên nội dung file
    records = []
    for mode, kind, oid, old, new in entries:
        if kind != b"blob":
            raise RuntimeError("Tree chứa đối tượng không phải blob")
        records.append(mode + b" " + oid + b"\t" + new + b"\0")

    git(
        "-c", "core.protectNTFS=false",
        "update-index", "-z", "--index-info",
        data=b"".join(records),
        env=env
    )

    tree = git(
        "write-tree",
        env=env
    ).decode().strip()

    # Tạo commit mới, không thay đổi HEAD trước khi thành công
    commit = git(
        "commit-tree", tree,
        "-p", head,
        data=b"Fix invalid Windows directory names\n",
        env=env
    ).decode().strip()

    # Chỉ cập nhật nhánh nếu HEAD chưa thay đổi
    branch = git(
        "symbolic-ref", "-q", "HEAD"
    ).decode().strip()

    git("update-ref", branch, commit, head)

    print("Đã tạo commit:", commit)
    print("Đã sửa", len(changes), "đường dẫn.")
    print("Nội dung blob được giữ nguyên.")

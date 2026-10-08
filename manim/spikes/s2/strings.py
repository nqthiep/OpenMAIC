"""The 200 Vietnamese test strings of spike S2 (card 3-S2). Deterministic: no randomness."""
import itertools

# every Vietnamese vowel with every tone, both cases, plus đ: 24 strings
VOWEL_GROUPS = [
    "aàáảãạ", "ăằắẳẵặ", "âầấẩẫậ", "eèéẻẽẹ", "êềếểễệ", "iìíỉĩị",
    "oòóỏõọ", "ôồốổỗộ", "ơờớởỡợ", "uùúủũụ", "ưừứửữự", "yỳýỷỹỵ",
]
LETTERS = [g for g in VOWEL_GROUPS] + [g.upper() for g in VOWEL_GROUPS]

WORDS = (
    "nghiêng thuyết chứng minh bất đẳng thức hình chiếu vectơ đường thẳng tiếp tuyến cát tuyến góc nội tiếp "
    "dây cung phương tích đồng quy trực tâm trọng tâm ngoại tiếp tam giác vuông cạnh huyền đường cao trung tuyến "
    "phân giác hàm số đạo hàm cực trị điểm uốn khảo sát đồ thị giới hạn dãy số tích phân nguyên hàm diện tích "
    "hình vuông hình chữ nhật cắt ghép quy nạp cơ sở bước chia hết ước chung lớn nhất thuật toán Euclid đồng dư "
    "chu kỳ luỹ thừa số nguyên tố tổ hợp hoán vị chỉnh hợp bao hàm loại trừ đường đi lưới ngăn kéo Dirichlet "
    "bàn cờ tô màu quân domino bất biến phép biến hình phép quay đối xứng vị tự số phức vô hạn hội tụ liên tục "
    "khả vi định lý giá trị trung bình dấu bằng xảy ra khi và chỉ khi ví dụ phản ví dụ nguỵ biện chứng minh bằng "
    "phản chứng điều kiện cần đủ tập hợp phần tử giao hợp hiệu bình phương lập phương căn bậc hai nghiệm phương "
    "trình hệ thức Viète tham số miền xác định tập giá trị tăng giảm đơn điệu tiệm cận"
).split()
assert len(WORDS) >= 120, len(WORDS)


def phrases(n: int) -> list[str]:
    out: list[str] = []
    step = 7  # a fixed stride through the vocabulary, so the phrases differ and nothing is random
    i = 0
    while len(out) < n:
        k = 2 + (len(out) % 3)  # 2, 3 or 4 words
        words = [WORDS[(i + j * step) % len(WORDS)] for j in range(k)]
        s = " ".join(words)
        s = s[0].upper() + s[1:]
        if s not in out:
            out.append(s)
        i += 5
    return out


def all_strings() -> list[str]:
    base = LETTERS + ["Đ đ Ư ư Ơ ơ Ă ă Â â Ê ê Ô ô"]
    return base + phrases(200 - len(base))


if __name__ == "__main__":
    s = all_strings()
    assert len(s) == 200 and len(set(s)) == 200
    chars = {c for t in s for c in t if not c.isspace()}
    print(len(s), "strings,", len(chars), "distinct characters")

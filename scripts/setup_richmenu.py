#!/usr/bin/env python3
"""リッチメニューを作って LINE に登録する。

お客様用とオーナー様用の2種類を作る。
リッチメニューは人ごとに差し替えられるので、オーナー様にだけ
別のものを割り当てられる（LINE公式アカウントは1つのまま）。

使い方:
    python3 scripts/setup_richmenu.py

何度実行しても同じ結果になる（古いものを消してから作り直す）。
"""

import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_REG = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

API = "https://api.line.me/v2/bot"
API_DATA = "https://api-data.line.me/v2/bot"

# 色
BG = (255, 255, 255)
LINE_COLOR = (229, 231, 235)
TEXT = (31, 41, 55)
SUB = (156, 163, 175)

# お客様用：2段×3列。送る文章は classify.ts が拾える言葉にしてある。
CUSTOMER = {
    "name": "customer",
    "chat_bar": "メニュー",
    "size": (2500, 1686),
    "cols": 3,
    "rows": 2,
    "items": [
        ("時", "営業時間", "定休日・最終受付", (16, 185, 129), "営業時間を教えてください"),
        ("¥", "メニュー・料金", "カット／カラー など", (236, 72, 153), "メニューと料金を教えてください"),
        ("分", "施術時間", "どのくらいかかる？", (59, 130, 246), "施術時間はどのくらいかかりますか"),
        ("空", "空き状況", "オーナーが確認します", (245, 158, 11), "空き状況を知りたいです"),
        ("変", "予約の変更", "キャンセルもこちら", (239, 68, 68), "予約を変更したいです"),
        ("他", "その他のご質問", "直接おたずねください", (107, 114, 128), "スタッフに質問したいです"),
    ],
}

# オーナー様用：2段×3列
#
# 休業は「本日」「明日」をボタン1つで出せるようにしてある。
# 年5〜6回の臨時休業は、ほとんどが急な当日・翌日の休みのため。
# どのお知らせも期限が来れば自動で消えるので、取り消しは任意。
OWNER = {
    "name": "owner",
    "chat_bar": "オーナーメニュー",
    "size": (2500, 1686),
    "cols": 3,
    "rows": 2,
    "items": [
        ("未", "未対応の一覧", "残っているもの", (239, 68, 68), "未対応"),
        ("休", "本日休業", "今日ぶんを出す", (245, 158, 11),
         {"type": "postback", "data": "closed_today", "displayText": "本日休業"}),
        ("翌", "明日休業", "明日ぶんを出す", (249, 115, 22),
         {"type": "postback", "data": "closed_tomorrow", "displayText": "明日休業"}),
        # 「休業 」まで入れた状態でキーボードを開く。日付はオーナー様が打つ。
        ("日", "日付を指定", "連休・先の予定", (139, 92, 246),
         {"type": "postback", "data": "closed_prompt",
          "inputOption": "openKeyboard", "fillInText": "休業 "}),
        ("開", "休業を取り消す", "早めに取り下げる", (16, 185, 129), "休業オフ"),
        ("?", "使い方", "コマンド一覧", (107, 114, 128), "ヘルプ"),
    ],
}


def env(key: str) -> str:
    text = (ROOT / ".env.local").read_text()
    m = re.search(rf"^{key}=(.*)$", text, re.M)
    if not m or not m.group(1).strip():
        sys.exit(f"{key} が .env.local にありません")
    return m.group(1).strip()


def centered(draw, text, font, cx, cy, fill):
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text((cx - (right + left) / 2, cy - (bottom + top) / 2), text, font=font, fill=fill)


def build_image(spec) -> pathlib.Path:
    w, h = spec["size"]
    cols, rows = spec["cols"], spec["rows"]
    cw, ch = w // cols, h // rows

    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    f_icon = ImageFont.truetype(FONT_BOLD, 108)
    f_label = ImageFont.truetype(FONT_BOLD, 76)
    f_sub = ImageFont.truetype(FONT_REG, 42)

    for i, (icon, label, sub, color, _) in enumerate(spec["items"]):
        col, row = i % cols, i // cols
        cx = col * cw + cw // 2
        cy = row * ch + ch // 2

        # 丸いアイコン。アイコンから補足までを、マスの中央にそろえる
        r = 96
        top = cy - 112
        d.ellipse([cx - r, top - r, cx + r, top + r], fill=color)
        centered(d, icon, f_icon, cx, top - 6, (255, 255, 255))

        centered(d, label, f_label, cx, cy + 98, TEXT)
        centered(d, sub, f_sub, cx, cy + 186, SUB)

    # 区切り線
    for c in range(1, cols):
        d.rectangle([c * cw - 3, 0, c * cw + 3, h], fill=LINE_COLOR)
    for r_ in range(1, rows):
        d.rectangle([0, r_ * ch - 3, w, r_ * ch + 3], fill=LINE_COLOR)

    out = ROOT / "scripts" / f"richmenu-{spec['name']}.png"
    img.save(out, "PNG")
    return out


def request(method, url, token, body=None, content_type="application/json"):
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        if content_type == "application/json":
            data = json.dumps(body).encode()
        else:
            data = body
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url}\n  HTTP {e.code}: {e.read().decode()[:400]}")


def create(spec, token) -> str:
    w, h = spec["size"]
    cols, rows = spec["cols"], spec["rows"]
    cw, ch = w // cols, h // rows

    areas = []
    for i, (_, _, _, _, action) in enumerate(spec["items"]):
        col, row = i % cols, i // cols
        areas.append({
            "bounds": {"x": col * cw, "y": row * ch, "width": cw, "height": ch},
            # 文字列ならそのまま送るボタン、辞書ならそのまま動作として使う
            "action": action if isinstance(action, dict)
                      else {"type": "message", "text": action},
        })

    menu_id = request("POST", f"{API}/richmenu", token, {
        "size": {"width": w, "height": h},
        "selected": False,
        "name": spec["name"],
        "chatBarText": spec["chat_bar"],
        "areas": areas,
    })["richMenuId"]

    png = build_image(spec)
    request("POST", f"{API_DATA}/richmenu/{menu_id}/content", token,
            png.read_bytes(), "image/png")
    return menu_id


def find_menu(token, name):
    for m in request("GET", f"{API}/richmenu/list", token).get("richmenus", []):
        if m.get("name") == name:
            return m["richMenuId"]
    return None


def main():
    token = env("LINE_CHANNEL_ACCESS_TOKEN")
    owner_id = env("OWNER_LINE_USER_ID")

    # オーナー様の端末で、お客様に見えている画面を確かめるための切り替え。
    # アカウントが1つしかなくても、お客様側の見え方を確認できる。
    if "--preview-customer" in sys.argv:
        request("DELETE", f"{API}/user/{owner_id}/richmenu", token)
        print("オーナー様の割り当てを外しました。")
        print("→ LINEを開き直すと、お客様用のメニューが表示されます。")
        print("→ 戻すときは: python3 scripts/setup_richmenu.py --restore-owner")
        return

    if "--restore-owner" in sys.argv:
        menu_id = find_menu(token, "owner")
        if not menu_id:
            sys.exit("オーナー様用メニューが見つかりません。引数なしで実行してください。")
        request("POST", f"{API}/user/{owner_id}/richmenu/{menu_id}", token)
        print("オーナー様用メニューに戻しました。")
        return

    # 古いものを消す（何度流しても同じ状態になるように）
    for m in request("GET", f"{API}/richmenu/list", token).get("richmenus", []):
        request("DELETE", f"{API}/richmenu/{m['richMenuId']}", token)
        print(f"  削除: {m.get('name')}")

    customer_id = create(CUSTOMER, token)
    print(f"  作成: お客様用      {customer_id}")

    owner_menu_id = create(OWNER, token)
    print(f"  作成: オーナー様用  {owner_menu_id}")

    # 全員にお客様用を出し、オーナー様だけ上書きする
    request("POST", f"{API}/user/all/richmenu/{customer_id}", token)
    request("POST", f"{API}/user/{owner_id}/richmenu/{owner_menu_id}", token)

    print("\n完了しました。LINEのトークを開き直すと表示されます。")


if __name__ == "__main__":
    main()

# 【見送り・保全】新型URLチェックインの完了カードをトークへ無料投稿（talkCard）

2026-08-22（本部v30）に実装→**オーナー判断で見送り**。将来の復活（有料push許容 or「1タップ版」代替、またはトーク起点チェックイン導線ができた時）に備えて保全する。

## 見送りの理由（重要・LINE仕様の壁）
`liff.sendMessages()` は **「1対1/グループ/複数人トークから開いたLIFF」でしか動かない**（公式仕様）。Keepメモ・外部リンク・**QR・NFC**・URLスキーム経由（＝プレート）から開くと 403 で黙って失敗する。新型プレートは NFC/QR で開く＝**プレート始点のチェックインでは無料でトークにカードを残せない**。有料 push なら可能だが「無料のみ」方針で対象外。
→ 無料で残せるのは「リッチメニュー/トーク内リンクから始めたチェックイン」だけ。スコープ `chat_message.write` はテストLIFF `2008851980-Ky1Q5Lh9` で ON 確認済み（原因はスコープではない）。

## 保全物のありか
- **クライアント（checkin.html）**：LIFFリポジトリ `github.com/saygo1971/jcj-liff`
  - 実装コミット＝`35766c2`（main）／保全ブランチ＝`shelved/checkin-talkcard-2026-08-22`
  - 追加した関数＝`sendCheckinCardToTalk(card)`（isInClient＆isApiAvailable("sendMessages")のときだけ `liff.sendMessages([card])`、失敗は黙ってスルー）と、`renderDone` 末尾の `if (!r.alreadyToday && r.talkCard) sendCheckinCardToTalk(r.talkCard);`
- **サーバ（GAS コード.js の `apiCheckinDo`）**：テスト共有GAS scriptId `1Qn6esG7xveflGVoygf-YMlJCgb_41eJGGMXxPFTTUknStJ3kqrsN8txZ`
  - 実装バージョン＝**@471**（版ラベルは "TMP_verify_talkcard_DELETE" だが中身が talkCard 実装）
  - 下記パッチを apiCheckinDo の「非pending成功の return 直前」に戻せば復活する

## GAS 復活パッチ（apiCheckinDo）
`beansDiscountYen` を読む2行の直後（`return {` の直前）に挿入：

```js
    // 🗒️ 無料でトークに"残す"用の完了カード。新型URLチェックインでも、旧チェックインと同じカードを
    //    ユーザー起点(checkin.html の liff.sendMessages)でトークに置けるよう、GAS側で組んで返す。
    //    既存 getCheckinSuccessCard をそのまま流用＝見た目・ボタンは旧チェックインと完全一致。
    //    新規チェックイン時のみ組む（本日重複は+0マイルなので投稿しない）。組めなくてもチェックインは壊さない(null)。
    let talkCard = null;
    if (!r.alreadyToday) {
      try {
        const cardRow = findShopById(ss, r.shopId, ref.spotsData);
        if (cardRow) {
          const S_MAP = getSMap_(ss);
          talkCard = getCheckinSuccessCard(
            "",                              // pNo（カード内で未使用）
            r.shopId, r.shopName, r.earnedMile,
            cardRow[S_MAP.DISPLAY_PLACE], r.newTotal,
            cardRow[S_MAP.INSTA], cardRow[S_MAP.SHOP_PHOTO], r.pref,
            uid, ticketBalance, ticketEnabled, beansBalance, beansEnabled
          );
        }
      } catch (e) { talkCard = null; }
    }
```

そして return オブジェクトの末尾に `talkCard: talkCard` を追加（直前の `beansExchangeUrl` 行末にカンマを付ける）。

## 復活時の注意
- 本番へ入れる場合は本番 `apiCheckinDo`(prod)＋`checkin_prod.html`＋本番チェックインLIFFの `chat_message.write` スコープが必要。
- トークに実際に出るのは「トークから開いたチェックイン」だけ（プレート始点は不可）。プレートでも残すなら有料push か「1タップでOAトークへ簡易テキスト送信」の代替設計が必要。
- テスト再配備は本部窓口一本化。version200上限に注意（古い版はGAS UIで整理）。
